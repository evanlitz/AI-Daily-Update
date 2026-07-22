import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { getNeighbors } from '@/lib/graph'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const neighbors = await getNeighbors('story_thread', id, { edgeType: 'evidence_for', direction: 'in' })
  if (!neighbors.length) return NextResponse.json([])

  const placeholders = neighbors.map(() => '?').join(',')
  const { rows } = await db.execute({
    sql: `SELECT id, title, category, confidence, status FROM ai_predictions WHERE id IN (${placeholders})`,
    args: neighbors.map(n => n.id),
  })
  const byId = new Map((rows as any[]).map(r => [r.id, r]))

  const result = neighbors
    .filter(n => byId.has(n.id))
    .sort((a, b) => b.weight - a.weight || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10)
    .map(n => ({ ...byId.get(n.id), weight: n.weight, label: n.label, updated_at: n.updatedAt }))

  return NextResponse.json(result)
}
