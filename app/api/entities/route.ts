import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const sort = new URL(req.url).searchParams.get('sort') ?? 'mentions'

  const now   = Date.now()
  const cut7  = new Date(now - 7  * 24 * 3600_000).toISOString()
  const cut14 = new Date(now - 14 * 24 * 3600_000).toISOString()

  // The LIMIT has to be applied *before* the mention join, not after. Written the
  // obvious way (join everything, GROUP BY, ORDER BY, LIMIT 150) SQLite aggregates
  // every entity's full mention history and sorts the whole set before discarding
  // all but 150 rows — the plan was `SCAN e` + a per-entity probe into
  // entity_mentions. Latency hid it; Turso's rows-read billing did not. Narrowing
  // to the top 150 in a CTE first makes the join touch 150 entities' mentions
  // instead of every entity's, for byte-identical output.
  const { rows } = await db.execute({
    sql: `WITH top AS (
            SELECT id, name, type, mention_count, first_seen, mention_score
            FROM entities
            ORDER BY mention_score DESC
            LIMIT 150
          )
          SELECT
            t.id, t.name, t.type, t.mention_count, t.first_seen,
            COALESCE(SUM(CASE WHEN em.created_at >= ? THEN 1 ELSE 0 END), 0)                          AS this_week,
            COALESCE(SUM(CASE WHEN em.created_at >= ? AND em.created_at < ? THEN 1 ELSE 0 END), 0)    AS last_week
          FROM top t
          LEFT JOIN entity_mentions em ON em.entity_id = t.id
          GROUP BY t.id, t.name, t.type, t.mention_count, t.first_seen, t.mention_score
          ORDER BY t.mention_score DESC`,
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
