import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { rows } = await db.execute({
    sql: `SELECT
            ap.id, ap.title, ap.category, ap.confidence, ap.status,
            ge.weight, ge.label, ge.updated_at
          FROM graph_edges ge
          JOIN ai_predictions ap ON ap.id = ge.from_id
          WHERE ge.from_type = 'prediction'
            AND ge.to_type   = 'story_thread'
            AND ge.to_id     = ?
            AND ge.edge_type = 'evidence_for'
          ORDER BY ge.weight DESC, ge.updated_at DESC
          LIMIT 10`,
    args: [id],
  })

  return NextResponse.json(rows)
}
