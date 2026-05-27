import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const sort = new URL(req.url).searchParams.get('sort') ?? 'mentions'

  const now   = Date.now()
  const cut7  = new Date(now - 7  * 24 * 3600_000).toISOString()
  const cut14 = new Date(now - 14 * 24 * 3600_000).toISOString()

  const { rows } = await db.execute({
    sql: `SELECT
            e.id, e.name, e.type, e.mention_count, e.first_seen,
            COALESCE(SUM(CASE WHEN em.created_at >= ? THEN 1 ELSE 0 END), 0)                          AS this_week,
            COALESCE(SUM(CASE WHEN em.created_at >= ? AND em.created_at < ? THEN 1 ELSE 0 END), 0)    AS last_week
          FROM entities e
          LEFT JOIN entity_mentions em ON em.entity_id = e.id
          GROUP BY e.id, e.name, e.type, e.mention_count, e.first_seen
          ORDER BY e.mention_count DESC
          LIMIT 150`,
    args: [cut7, cut14, cut7],
  })

  const withVelocity = (rows as any[]).map(row => {
    const thisWeek = Number(row.this_week)
    const lastWeek = Number(row.last_week)
    // Dampen ratio for 0→1 jumps; cap displayed precision
    const velocity = Math.round((thisWeek / Math.max(lastWeek, 0.5)) * 10) / 10
    return { ...row, this_week: thisWeek, last_week: lastWeek, velocity }
  })

  if (sort === 'trending') {
    withVelocity.sort((a, b) => {
      // score = volume × capped velocity boost (max 4×) — favours real acceleration over noise
      const score = (r: typeof a) => r.this_week * Math.min(r.velocity, 4)
      return score(b) - score(a)
    })
  }

  return NextResponse.json(withVelocity.slice(0, 60))
}
