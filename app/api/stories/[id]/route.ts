import { NextResponse } from 'next/server'
import { deleteStoryThread } from '@/lib/intelligence/stories'
import db from '@/lib/db'

const STOP = new Set(['with','that','this','from','have','been','will','more','over','into','about','when','what','where','which','their','there'])

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { rows: threads } = await db.execute({
    sql: `SELECT * FROM story_threads WHERE id = ?`,
    args: [id],
  })
  if (!(threads as any[]).length) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const thread = threads[0] as any

  const keywords = (thread.title as string)
    .split(/[\s,]+/)
    .map((w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((w: string) => w.length > 3 && !STOP.has(w))
    .slice(0, 4)

  const [eventsResult, itemsResult, entitiesResult] = await Promise.all([
    db.execute({
      sql: `SELECT * FROM story_events WHERE thread_id = ? ORDER BY created_at DESC`,
      args: [id],
    }),
    keywords.length > 0
      ? db.execute({
          sql: `SELECT id, source, title, url, summary, published_at, hook, velocity_score
                FROM feed_items
                WHERE ${keywords.map(() => `(title LIKE ? OR summary LIKE ?)`).join(' OR ')}
                ORDER BY published_at DESC
                LIMIT 12`,
          args: keywords.flatMap((k: string) => [`%${k}%`, `%${k}%`]),
        })
      : Promise.resolve({ rows: [] }),
    db.execute({
      sql: `SELECT e.id, e.name, e.type, COUNT(DISTINCT em.source_id) as item_count
            FROM entity_mentions em
            JOIN entities e ON e.id = em.entity_id
            WHERE em.source_type = 'feed_item'
              AND em.source_id IN (
                SELECT j.value FROM story_events se, json_each(se.feed_item_ids) j
                WHERE se.thread_id = ?
              )
            GROUP BY e.id, e.name, e.type
            ORDER BY item_count DESC
            LIMIT 5`,
      args: [id],
    }),
  ])

  return NextResponse.json({
    ...thread,
    events: (eventsResult.rows as any[]).map(e => ({
      ...e,
      feed_item_ids: (() => { try { return JSON.parse(e.feed_item_ids ?? '[]') } catch { return [] } })(),
    })),
    related_items: itemsResult.rows,
    topEntities: entitiesResult.rows,
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteStoryThread(id)
  return NextResponse.json({ ok: true })
}
