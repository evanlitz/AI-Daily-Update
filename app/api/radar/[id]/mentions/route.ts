import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { rows } = await db.execute({
    sql: `SELECT fi.id, fi.title, fi.url, fi.source, fi.published_at
          FROM graph_edges ge
          JOIN feed_items fi ON fi.id = ge.from_id
          WHERE ge.from_type = 'feed_item'
            AND ge.to_type   = 'tech_radar'
            AND ge.to_id     = ?
            AND ge.edge_type = 'mentions'
          ORDER BY fi.fetched_at DESC
          LIMIT 20`,
    args: [id],
  })

  return NextResponse.json(rows)
}
