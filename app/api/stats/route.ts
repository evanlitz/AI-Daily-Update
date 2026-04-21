import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const countRow = db.prepare(
    `SELECT COUNT(*) as count FROM feed_items WHERE fetched_at >= ?`
  ).get(weekAgo) as any

  const allItems = db.prepare(
    `SELECT topic_tags, velocity_score FROM feed_items WHERE fetched_at >= ?`
  ).all(weekAgo) as any[]

  const tagVelocity: Record<string, number[]> = {}
  for (const item of allItems) {
    const tags: string[] = JSON.parse(item.topic_tags ?? '[]')
    for (const tag of tags) {
      if (!tagVelocity[tag]) tagVelocity[tag] = []
      tagVelocity[tag].push(item.velocity_score ?? 0)
    }
  }

  let topTopic = 'models'
  let topAvg = -1
  for (const [tag, scores] of Object.entries(tagVelocity)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    if (avg > topAvg) { topAvg = avg; topTopic = tag }
  }

  const topItem = db.prepare(
    `SELECT title, velocity_score FROM feed_items ORDER BY velocity_score DESC LIMIT 1`
  ).get() as any

  return NextResponse.json({
    itemsThisWeek: countRow?.count ?? 0,
    topTopic,
    topVelocityItem: topItem ? { title: topItem.title, score: topItem.velocity_score } : null,
  })
}
