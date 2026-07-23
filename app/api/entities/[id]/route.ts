import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { getNeighbors, traverse } from '@/lib/graph'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const [entityRes, feedItemsRes, storiesRes, coMentioned, associated, traversed, related] = await Promise.all([
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
    getNeighbors('entity', id, { edgeType: 'co_mentioned' }),
    getNeighbors('entity', id, { edgeType: 'associated_with', direction: 'out' }),
    traverse('entity', id, 2),
    getNeighbors('entity', id, { edgeType: 'related_to' }),
  ])

  const entity = entityRes.rows[0] as any
  if (!entity) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // traverse() dedupes each node to its minimum depth, so filtering to
  // depth === 2 already excludes anything reachable directly (co_mentioned or
  // associated_with, both depth 1) — this is genuinely "2 hops or nothing."
  const twoHopEntityIds = traversed.filter(n => n.type === 'entity' && n.depth === 2).map(n => n.id)

  const [relatedEntities, associatedTools, extendedNetwork, relationships] = await Promise.all([
    hydrateEntities(coMentioned),
    hydrateTools(associated),
    hydrateEntityIds(twoHopEntityIds),
    hydrateRelationships(related),
  ])

  return NextResponse.json({
    entity: { ...entity, aliases: JSON.parse(entity.aliases ?? '[]') },
    feedItems: feedItemsRes.rows,
    relatedStories: storiesRes.rows,
    relatedEntities,
    associatedTools,
    extendedNetwork,
    relationships,
  })
}

async function hydrateEntities(neighbors: Awaited<ReturnType<typeof getNeighbors>>) {
  if (!neighbors.length) return []
  const placeholders = neighbors.map(() => '?').join(',')
  const { rows } = await db.execute({
    sql: `SELECT id, name, type FROM entities WHERE id IN (${placeholders})`,
    args: neighbors.map(n => n.id),
  })
  const byId = new Map((rows as any[]).map(r => [r.id, r]))
  return neighbors
    .filter(n => byId.has(n.id))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10)
    .map(n => ({ related_id: n.id, weight: n.weight, ...byId.get(n.id) }))
}

async function hydrateTools(neighbors: Awaited<ReturnType<typeof getNeighbors>>) {
  if (!neighbors.length) return []
  const placeholders = neighbors.map(() => '?').join(',')
  const { rows } = await db.execute({
    sql: `SELECT id, name, category, quadrant FROM tech_radar WHERE id IN (${placeholders})`,
    args: neighbors.map(n => n.id),
  })
  const byId = new Map((rows as any[]).map(r => [r.id, r]))
  return neighbors
    .filter(n => byId.has(n.id))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10)
    .map(n => ({ tool_id: n.id, weight: n.weight, ...byId.get(n.id) }))
}

// traverse() gives ids/depth only, no weight to sort by (it's a plain BFS,
// not edge-weighted) — cap at 10 and let mention_count stand in as the
// relevance signal instead.
async function hydrateEntityIds(ids: string[]) {
  if (!ids.length) return []
  const placeholders = ids.map(() => '?').join(',')
  const { rows } = await db.execute({
    sql: `SELECT id, name, type, mention_count FROM entities WHERE id IN (${placeholders}) ORDER BY mention_count DESC LIMIT 10`,
    args: ids,
  })
  return (rows as any[]).map(r => ({ related_id: r.id, name: r.name, type: r.type }))
}

// classifyEntityRelationships() writes a related_to edge even for label='none'
// (so the pair doesn't get re-sent to Claude every cycle) — filter those out
// here rather than at write time, same "store everything, filter at read"
// approach the rest of this route already takes.
async function hydrateRelationships(neighbors: Awaited<ReturnType<typeof getNeighbors>>) {
  const typed = neighbors.filter(n => n.label && n.label !== 'none')
  if (!typed.length) return []
  const placeholders = typed.map(() => '?').join(',')
  const { rows } = await db.execute({
    sql: `SELECT id, name, type FROM entities WHERE id IN (${placeholders})`,
    args: typed.map(n => n.id),
  })
  const byId = new Map((rows as any[]).map(r => [r.id, r]))
  return typed
    .filter(n => byId.has(n.id))
    .map(n => ({ related_id: n.id, label: n.label, direction: n.direction, ...byId.get(n.id) }))
}
