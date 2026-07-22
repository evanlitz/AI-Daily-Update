import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { getNeighbors } from '@/lib/graph'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const { rows: modelRows } = await db.execute({ sql: `SELECT id FROM ai_models WHERE slug = ?`, args: [slug] })
  const modelId = (modelRows[0] as any)?.id
  if (!modelId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [supersedesOut, supersedesIn, introducedByOut] = await Promise.all([
    getNeighbors('ai_model', modelId, { edgeType: 'supersedes', direction: 'out' }),
    getNeighbors('ai_model', modelId, { edgeType: 'supersedes', direction: 'in' }),
    getNeighbors('ai_model', modelId, { edgeType: 'introduced_by', direction: 'out' }),
  ])

  const [supersedes, supersededBy, introducedBy] = await Promise.all([
    hydrateModels(supersedesOut),
    hydrateModels(supersedesIn),
    hydrateFeedItems(introducedByOut.slice(0, 1)),
  ])

  return NextResponse.json({
    supersedes,
    supersededBy,
    introducedBy: introducedBy[0] ?? null,
  })
}

async function hydrateModels(neighbors: Awaited<ReturnType<typeof getNeighbors>>) {
  if (!neighbors.length) return []
  const placeholders = neighbors.map(() => '?').join(',')
  const { rows } = await db.execute({
    sql: `SELECT id, name, slug FROM ai_models WHERE id IN (${placeholders})`,
    args: neighbors.map(n => n.id),
  })
  return rows
}

async function hydrateFeedItems(neighbors: Awaited<ReturnType<typeof getNeighbors>>) {
  if (!neighbors.length) return []
  const placeholders = neighbors.map(() => '?').join(',')
  const { rows } = await db.execute({
    sql: `SELECT id, title, url, source, published_at FROM feed_items WHERE id IN (${placeholders})`,
    args: neighbors.map(n => n.id),
  })
  return rows
}
