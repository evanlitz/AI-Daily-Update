import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { getNeighbors } from '@/lib/graph'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const neighbors = await getNeighbors('tech_radar', id, { edgeType: 'mentions', direction: 'in' })
  if (!neighbors.length) return NextResponse.json([])

  const placeholders = neighbors.map(() => '?').join(',')
  const { rows } = await db.execute({
    sql: `SELECT id, title, url, source, published_at, fetched_at FROM feed_items WHERE id IN (${placeholders})`,
    args: neighbors.map(n => n.id),
  })

  const result = (rows as any[])
    .sort((a, b) => (b.fetched_at ?? '').localeCompare(a.fetched_at ?? ''))
    .slice(0, 20)
    .map(({ fetched_at, ...rest }) => rest)

  return NextResponse.json(result)
}
