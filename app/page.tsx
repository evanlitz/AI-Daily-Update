import { TrendFeed } from '@/components/TrendFeed'
import type { FeedItem } from '@/lib/types'

async function getFeed(): Promise<FeedItem[]> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${base}/api/feed?page=1`, { cache: 'no-store' })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

async function getStats() {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${base}/api/stats`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export default async function Home() {
  const [items, stats] = await Promise.all([getFeed(), getStats()])

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
