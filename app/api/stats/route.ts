import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { rows: countRows } = await db.execute({ sql: `SELECT COUNT(*) as count FROM feed_items WHERE fetched_at >= ?`, args: [weekAgo] })
  const { rows: allItems }  = await db.execute({ sql: `SELECT topic_tags, velocity_score FROM feed_items WHERE fetched_at >= ?`, args: [weekAgo] })

  const tagVelocity: Record<string, number[]> = {}
  for (const item of allItems as any[]) {
    const tags: string[] = JSON.parse(item.topic_tags ?? '[]')
    for (const tag of tags) {
      if (!tagVelocity[tag]) tagVelocity[tag] = []
      tagVelocity[tag].push(item.velocity_score ?? 0)
    }
  }

  let topTopic = 'models', topAvg = -1
  for (const [tag, scores] of Object.entries(tagVelocity)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    if (avg > topAvg) { topAvg = avg; topTopic = tag }
  }

  const { rows: topRows }   = await db.execute(`SELECT title, velocity_score FROM feed_items ORDER BY velocity_score DESC LIMIT 1`)
  const { rows: freshRows } = await db.execute(`SELECT MAX(fetched_at) as last_fetch FROM feed_items`)
  const topItem    = topRows[0] as any
  const lastFetch  = (freshRows[0] as any)?.last_fetch as string | null
  const staleHours = lastFetch ? (Date.now() - new Date(lastFetch).getTime()) / 3_600_000 : null

  return NextResponse.json({
    itemsThisWeek: (countRows[0] as any)?.count ?? 0,
    topTopic,
    topVelocityItem: topItem ? { title: topItem.title, score: topItem.velocity_score } : null,
    lastFetchAt: lastFetch ?? null,
    isStale: staleHours !== null ? staleHours > 36 : false,
  })
}
