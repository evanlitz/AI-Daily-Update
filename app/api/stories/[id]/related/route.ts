import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { rows } = await db.execute({
    sql: `SELECT
            CASE WHEN tr.thread_a_id = ? THEN tr.thread_b_id ELSE tr.thread_a_id END AS related_id,
            tr.shared_tags,
            tr.strength,
            tr.label,
            st.title,
            st.category,
            st.current_summary,
            st.last_updated
          FROM thread_relations tr
          JOIN story_threads st
            ON st.id = CASE WHEN tr.thread_a_id = ? THEN tr.thread_b_id ELSE tr.thread_a_id END
          WHERE (tr.thread_a_id = ? OR tr.thread_b_id = ?)
            AND st.status = 'active'
          ORDER BY tr.strength DESC
          LIMIT 6`,
    args: [id, id, id, id],
  })

  return NextResponse.json(
    (rows as any[]).map(r => ({
      ...r,
      shared_tags: JSON.parse(r.shared_tags ?? '[]'),
    }))
  )
}
