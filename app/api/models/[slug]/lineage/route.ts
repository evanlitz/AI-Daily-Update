import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const { rows: modelRows } = await db.execute({ sql: `SELECT id FROM ai_models WHERE slug = ?`, args: [slug] })
  const modelId = (modelRows[0] as any)?.id
  if (!modelId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [supersedesRes, supersededByRes, introducedByRes] = await Promise.all([
    // This model supersedes X — this model is the `from` side of the edge.
    db.execute({
      sql: `SELECT am.id, am.name, am.slug
            FROM graph_edges ge JOIN ai_models am ON am.id = ge.to_id
            WHERE ge.edge_type = 'supersedes' AND ge.from_type = 'ai_model' AND ge.to_type = 'ai_model'
              AND ge.from_id = ?`,
      args: [modelId],
    }),
    // X supersedes this model — this model is the `to` side of the edge.
    db.execute({
      sql: `SELECT am.id, am.name, am.slug
            FROM graph_edges ge JOIN ai_models am ON am.id = ge.from_id
            WHERE ge.edge_type = 'supersedes' AND ge.from_type = 'ai_model' AND ge.to_type = 'ai_model'
              AND ge.to_id = ?`,
      args: [modelId],
    }),
    db.execute({
      sql: `SELECT fi.id, fi.title, fi.url, fi.source, fi.published_at
            FROM graph_edges ge JOIN feed_items fi ON fi.id = ge.to_id
            WHERE ge.edge_type = 'introduced_by' AND ge.from_type = 'ai_model' AND ge.to_type = 'feed_item'
              AND ge.from_id = ?
            LIMIT 1`,
      args: [modelId],
    }),
  ])

  return NextResponse.json({
    supersedes: supersedesRes.rows,
    supersededBy: supersededByRes.rows,
    introducedBy: introducedByRes.rows[0] ?? null,
  })
}
