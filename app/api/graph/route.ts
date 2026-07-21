import { NextResponse } from 'next/server'
import db from '@/lib/db'

type RawEdge = {
  fromType: string
  fromId: string
  toType: string
  toId: string
  edgeType: string
  weight: number
  label: string | null
}

const TABLE_META: Record<string, { table: string; labelCol: string; extra?: string }> = {
  entity: { table: 'entities', labelCol: 'name' },
  feed_item: { table: 'feed_items', labelCol: 'title', extra: 'url' },
  story_thread: { table: 'story_threads', labelCol: 'title' },
  prediction: { table: 'ai_predictions', labelCol: 'title' },
  ai_model: { table: 'ai_models', labelCol: 'name' },
  tech_radar: { table: 'tech_radar', labelCol: 'name' },
}

export async function GET() {
  const [edgesRes, mentionsRes, relationsRes] = await Promise.all([
    db.execute(`SELECT from_type, from_id, to_type, to_id, edge_type, weight, label FROM graph_edges`),
    db.execute(`SELECT entity_id, source_id FROM entity_mentions WHERE source_type = 'feed_item'`),
    db.execute(`SELECT thread_a_id, thread_b_id, strength, label FROM thread_relations`),
  ])

  const edges: RawEdge[] = [
    ...(edgesRes.rows as any[]).map(r => ({
      fromType: r.from_type as string, fromId: r.from_id as string,
      toType: r.to_type as string, toId: r.to_id as string,
      edgeType: r.edge_type as string, weight: (r.weight as number) ?? 1, label: (r.label as string) ?? null,
    })),
    ...(mentionsRes.rows as any[]).map(r => ({
      fromType: 'entity', fromId: r.entity_id as string,
      toType: 'feed_item', toId: r.source_id as string,
      edgeType: 'entity_mention', weight: 1, label: null,
    })),
    ...(relationsRes.rows as any[]).map(r => ({
      fromType: 'story_thread', fromId: r.thread_a_id as string,
      toType: 'story_thread', toId: r.thread_b_id as string,
      edgeType: 'thread_relation', weight: (r.strength as number) ?? 0, label: (r.label as string) ?? null,
    })),
  ]

  const idsByType: Record<string, Set<string>> = {}
  for (const type of Object.keys(TABLE_META)) idsByType[type] = new Set()
  for (const e of edges) {
    idsByType[e.fromType]?.add(e.fromId)
    idsByType[e.toType]?.add(e.toId)
  }

  const labelResults = await Promise.all(
    Object.entries(idsByType)
      .filter(([, ids]) => ids.size > 0)
      .map(async ([type, ids]) => {
        const idList = [...ids]
        const meta = TABLE_META[type]
        const cols = meta.extra ? `id, ${meta.labelCol} AS label, ${meta.extra} AS url` : `id, ${meta.labelCol} AS label`
        const res = await db.execute({
          sql: `SELECT ${cols} FROM ${meta.table} WHERE id IN (${idList.map(() => '?').join(',')})`,
          args: idList,
        })
        return { type, rows: res.rows as any[] }
      })
  )

  const nodes = new Map<string, { id: string; type: string; label: string; url?: string }>()
  for (const { type, rows } of labelResults) {
    for (const r of rows) {
      nodes.set(`${type}:${r.id}`, {
        id: `${type}:${r.id}`,
        type,
        label: (r.label as string) ?? r.id,
        ...(r.url ? { url: r.url as string } : {}),
      })
    }
  }

  const outEdges = edges
    .map(e => ({
      source: `${e.fromType}:${e.fromId}`,
      target: `${e.toType}:${e.toId}`,
      edgeType: e.edgeType,
      weight: e.weight,
      label: e.label,
    }))
    .filter(e => nodes.has(e.source) && nodes.has(e.target))

  return NextResponse.json({ nodes: [...nodes.values()], edges: outEdges })
}
