import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const [entityRes, feedItemsRes, storiesRes] = await Promise.all([
    db.execute({ sql: `SELECT * FROM entities WHERE id = ?`, args: [id] }),
    db.execute({
      sql: `SELECT fi.id, fi.title, fi.url, fi.source, fi.hook, fi.published_at, fi.velocity_score
            FROM entity_mentions em
            JOIN feed_items fi ON fi.id = em.source_id
            WHERE em.entity_id = ? AND em.source_type = 'feed_item'
            ORDER BY fi.fetched_at DESC
            LIMIT 40`,
      args: [id],
    }),
    db.execute({
      sql: `SELECT DISTINCT st.id, st.title, st.category, st.last_updated
            FROM story_threads st
            JOIN story_events se ON se.thread_id = st.id
            WHERE st.status = 'active'
              AND EXISTS (
                SELECT 1 FROM json_each(se.feed_item_ids) j
                JOIN entity_mentions em ON em.source_id = j.value
                WHERE em.entity_id = ? AND em.source_type = 'feed_item'
              )
            ORDER BY st.last_updated DESC
            LIMIT 5`,
      args: [id],
    }),
  ])

  const entity = entityRes.rows[0] as any
  if (!entity) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    entity: { ...entity, aliases: JSON.parse(entity.aliases ?? '[]') },
    feedItems: feedItemsRes.rows,
    relatedStories: storiesRes.rows,
  })
}
