import db from '../db'

const STOP = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','was','are','were','be','been','have','has','had','do','does',
  'did','will','would','could','should','may','might','can','this','that',
  'these','those','its','it','as','up','out','about','into','than','more',
  'new','using','use','used','how','what','why','when','which','who','open',
  'your','their','our','his','her','over','make','makes','made','just',
  'also','some','all','not','very','been','after','first','through',
])

function keywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP.has(w))
    .slice(0, 6)
}

export function updateVelocityScores(): void {
  const now  = Date.now()
  const cut7  = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString()
  const cut30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()

  const items = db.prepare(
    `SELECT id, title, fetched_at FROM feed_items WHERE fetched_at >= ?`
  ).all(cut30) as { id: string; title: string; fetched_at: string }[]

  if (items.length === 0) return

  // How old is the oldest item? Determines scoring mode.
  const oldestTs = items.reduce((min, i) => i.fetched_at < min ? i.fetched_at : min, items[0].fetched_at)
  const dbAgeDays = (now - new Date(oldestTs).getTime()) / 86_400_000
  const freshMode = dbAgeDays < 14   // < 2 weeks of data → use relative-frequency mode

  // Build per-keyword frequency counters
  const kw30: Record<string, number> = {}
  const kw7:  Record<string, number> = {}

  for (const item of items) {
    const in7 = item.fetched_at >= cut7
    for (const kw of keywords(item.title)) {
      kw30[kw] = (kw30[kw] ?? 0) + 1
      if (in7) kw7[kw] = (kw7[kw] ?? 0) + 1
    }
  }

  // Compute per-keyword velocity score
  const kwVel: Record<string, number> = {}

  if (freshMode) {
    // Fresh DB: score = keyword frequency relative to average keyword frequency.
    // This gives natural spread even when we have no 30-day baseline.
    // A keyword appearing in 10% of titles scores ~3x; one in 1% scores ~0.3x.
    const totalOccurrences = Object.values(kw30).reduce((s, c) => s + c, 0)
    const uniqueKeywords   = Object.keys(kw30).length
    const avgFreq = totalOccurrences / Math.max(uniqueKeywords, 1)

    for (const [kw, c30] of Object.entries(kw30)) {
      kwVel[kw] = Math.min(c30 / Math.max(avgFreq, 0.5), 4.0)
    }
  } else {
    // Mature DB: proper 7-day vs 30-day acceleration ratio.
    // velocity > 1.0 means "more mentions this week than the monthly average" (accelerating).
    // velocity < 1.0 means the topic is cooling off.
    for (const [kw, c30] of Object.entries(kw30)) {
      const rate7  = (kw7[kw] ?? 0) / 7
      const rate30 = c30 / 30
      kwVel[kw] = Math.min(rate7 / Math.max(rate30, 0.01), 5.0)
    }
  }

  // Assign velocity to each item:
  // Take the top-2 keyword scores and average them.
  // This avoids a single rare-but-trendy word dominating,
  // and avoids averaging down by common-but-flat words.
  const update = db.prepare(`UPDATE feed_items SET velocity_score = ? WHERE id = ?`)

  const txn = db.transaction(() => {
    for (const item of items) {
      const kws    = keywords(item.title)
      const scores = kws.map(kw => kwVel[kw] ?? 0).sort((a, b) => b - a)
      const top2   = scores.slice(0, 2)
      const vel    = top2.length > 0
        ? top2.reduce((s, v) => s + v, 0) / top2.length
        : 0
      update.run(Math.round(vel * 100) / 100, item.id)
    }
    // Zero out items older than 30 days
    db.prepare(`UPDATE feed_items SET velocity_score = 0 WHERE fetched_at < ?`).run(cut30)
  })
  txn()

  // Log a quick summary
  const allScores  = items.map(i => {
    const kws  = keywords(i.title)
    const top2 = kws.map(kw => kwVel[kw] ?? 0).sort((a, b) => b - a).slice(0, 2)
    return top2.length ? top2.reduce((s, v) => s + v, 0) / top2.length : 0
  })
  const max    = Math.max(...allScores).toFixed(2)
  const avg    = (allScores.reduce((s, v) => s + v, 0) / allScores.length).toFixed(2)
  const nonzero = allScores.filter(s => s > 0).length
  console.log(`[velocity] ${freshMode ? 'fresh-db' : 'mature-db'} mode · ${items.length} items · avg ${avg} · max ${max} · ${nonzero} non-zero`)
}
