import { TrendFeed } from '@/components/TrendFeed'
import db from '@/lib/db'
import type { FeedItem } from '@/lib/types'

async function getFeed(): Promise<FeedItem[]> {
  try {
    const { rows } = await db.execute({
      sql: `SELECT * FROM feed_items ORDER BY published_at DESC LIMIT 40`,
      args: [],
    })
    return (rows as any[]).map(i => ({ ...i, topic_tags: JSON.parse(i.topic_tags ?? '[]') }))
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
