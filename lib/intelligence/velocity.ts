import db from '../db'

const STOP = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','was','are','were','be','been','have','has','had','do','does','did','will','would','could','should','may','might','can','this','that','these','those','its','it','as','up','out','about','into','than','more','new','using','use','used','how','what','why','when','which','who','open','your','their','our','his','her','over','make','makes','made','just','also','some','all','not','very','been','after','first','through'])

function keywords(title: string): string[] {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)).slice(0, 6)
}

export async function updateVelocityScores(): Promise<void> {
  const now   = Date.now()
  const cut7  = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString()
  const cut30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { rows } = await db.execute({ sql: `SELECT id, title, fetched_at FROM feed_items WHERE fetched_at >= ?`, args: [cut30] })
  const items = rows as unknown as { id: string; title: string; fetched_at: string }[]
  if (!items.length) return

  const oldestTs  = items.reduce((min, i) => i.fetched_at < min ? i.fetched_at : min, items[0].fetched_at)
  const dbAgeDays = (now - new Date(oldestTs).getTime()) / 86_400_000
  const freshMode = dbAgeDays < 14

  const kw30: Record<string, number> = {}, kw7: Record<string, number> = {}
  for (const item of items) {
    const in7 = item.fetched_at >= cut7
    for (const kw of keywords(item.title)) {
      kw30[kw] = (kw30[kw] ?? 0) + 1
      if (in7) kw7[kw] = (kw7[kw] ?? 0) + 1
    }
  }

  const kwVel: Record<string, number> = {}
  if (freshMode) {
    const total = Object.values(kw30).reduce((s, c) => s + c, 0)
    const avg   = total / Math.max(Object.keys(kw30).length, 1)
    for (const [kw, c] of Object.entries(kw30)) kwVel[kw] = Math.min(c / Math.max(avg, 0.5), 4.0)
  } else {
    for (const [kw, c30] of Object.entries(kw30)) {
      kwVel[kw] = Math.min((kw7[kw] ?? 0) / 7 / Math.max(c30 / 30, 0.01), 5.0)
    }
  }

  const scored = items.map(item => {
    const top2 = keywords(item.title).map(kw => kwVel[kw] ?? 0).sort((a, b) => b - a).slice(0, 2)
    const vel   = top2.length ? top2.reduce((s, v) => s + v, 0) / top2.length : 0
    return { id: item.id, vel: Math.round(vel * 100) / 100 }
  })

  await db.batch(scored.map(({ id, vel }) => ({
    sql: `UPDATE feed_items SET velocity_score = ? WHERE id = ?`,
    args: [vel, id],
  })))
  await db.execute({ sql: `UPDATE feed_items SET velocity_score = 0 WHERE fetched_at < ?`, args: [cut30] })

  const allVels = scored.map(s => s.vel)
  console.log(`[velocity] ${freshMode ? 'fresh' : 'mature'} · ${items.length} items · max ${Math.max(...allVels).toFixed(2)} · avg ${(allVels.reduce((s, v) => s + v, 0) / allVels.length).toFixed(2)}`)
}
