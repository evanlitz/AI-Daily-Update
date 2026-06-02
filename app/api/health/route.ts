import { NextResponse } from 'next/server'
import db from '@/lib/db'

type SourceStatus = 'ok' | 'warn' | 'stale' | 'dead'

function computeStatus(lastFetchAt: string | null, lastCount: number): SourceStatus {
  if (!lastFetchAt) return 'dead'
  const ageMs = Date.now() - new Date(lastFetchAt).getTime()
  const hours = ageMs / 3_600_000
  if (hours > 72) return 'dead'
  if (hours > 24) return 'stale'
  if (lastCount === 0) return 'warn'
  return 'ok'
}

export async function GET() {
  const { rows } = await db.execute(`
    WITH latest AS (
      SELECT source, MAX(fetched_at) AS last_fetch
      FROM source_runs
      GROUP BY source
    )
    SELECT sr.source, sr.fetched_at AS last_fetch, sr.item_count AS last_count
    FROM source_runs sr
    JOIN latest l ON sr.source = l.source AND sr.fetched_at = l.last_fetch
    ORDER BY sr.source
  `)

  const sources = (rows as any[]).map(row => {
    const status = computeStatus(row.last_fetch, row.last_count)
    return {
      source: row.source as string,
      lastFetchAt: row.last_fetch as string,
      lastCount: row.last_count as number,
      status,
    }
  })

  const summary = { ok: 0, warn: 0, stale: 0, dead: 0 }
  for (const s of sources) summary[s.status]++

  const overallStatus =
    summary.dead > 0 ? 'critical' :
    summary.stale > 0 || summary.warn > 0 ? 'degraded' : 'ok'

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    overallStatus,
    summary,
    sources,
  })
}
