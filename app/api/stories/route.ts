import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET() {
  const { rows } = await db.execute(`
    WITH latest AS (
      SELECT thread_id, update_text, significance, week,
             ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY created_at DESC) AS rn
      FROM story_events
    )
    SELECT st.*,
           COUNT(se.id) AS event_count,
           l.update_text  AS latest_update,
           l.significance AS latest_significance,
           l.week         AS latest_week
    FROM story_threads st
    LEFT JOIN story_events se ON se.thread_id = st.id
    LEFT JOIN latest l ON l.thread_id = st.id AND l.rn = 1
    WHERE st.status = 'active'
    GROUP BY st.id
    ORDER BY st.is_pinned DESC, st.last_updated DESC
  `)
  return NextResponse.json(rows)
}
