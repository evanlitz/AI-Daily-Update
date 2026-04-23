import { TrendFeed } from '@/components/TrendFeed'
import db from '@/lib/db'
import type { FeedItem } from '@/lib/types'

function interleave(items: FeedItem[], limit: number): FeedItem[] {
  const bySource: Record<string, FeedItem[]> = {}
  for (const item of items) {
    const key = item.source.startsWith('rss:') ? 'rss' : item.source
    if (!bySource[key]) bySource[key] = []
    bySource[key].push(item)
  }
  const queues = Object.values(bySource)
  const result: FeedItem[] = []
  let i = 0
  while (result.length < limit) {
    let advanced = false
    for (const q of queues) {
      if (i < q.length) { result.push(q[i]); advanced = true }
      if (result.length >= limit) break
    }
    if (!advanced) break
    i++
  }
  return result
}

async function getFeed(): Promise<FeedItem[]> {
  try {
    // Pull a large pool sorted by recency per source, then interleave so every
    // active source gets slots in the initial render.
    const { rows } = await db.execute({
      sql: `SELECT * FROM feed_items ORDER BY published_at DESC LIMIT 400`,
      args: [],
    })
    const parsed = (rows as any[]).map(i => ({ ...i, topic_tags: JSON.parse(i.topic_tags ?? '[]') }))
    return interleave(parsed, 40)
  } catch { return [] }
}

export default async function Home() {
  const [items, stats] = await Promise.all([getFeed(), Promise.resolve(null)])

  return (
    <main className="mx-auto max-w-screen-xl px-5 py-8">
      <div className="mb-7">
        <p className="eyebrow mb-2">Intel Feed</p>
        <h1 style={{
          color: '#e8e8f0', fontSize: 28, fontWeight: 900,
          letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 5,
        }}>
          AI Pulse
        </h1>
        <p style={{ color: '#8080b0', fontSize: 14 }}>
          ArXiv · HackerNews · HuggingFace · GitHub · RSS — refreshed every 6 hours
        </p>
      </div>

      <TrendFeed items={items} stats={stats} />
    </main>
  )
}
