import db from './db'

export type SourceStatus = 'ok' | 'warn' | 'stale' | 'dead'

// benchmark-sync runs every 10 days — use a wider staleness window for it
const STALE_HOURS: Record<string, { warn: number; dead: number }> = {
  'benchmark-sync': { warn: 240, dead: 288 }, // 10d warn, 12d dead
}
const DEFAULT_THRESHOLDS = { warn: 24, dead: 72 }

export function computeStatus(lastFetchAt: string | null, lastCount: number, source: string): SourceStatus {
  if (!lastFetchAt) return 'dead'
  const ageMs = Date.now() - new Date(lastFetchAt).getTime()
  const hours = ageMs / 3_600_000
  const { warn, dead } = STALE_HOURS[source] ?? DEFAULT_THRESHOLDS
  if (hours > dead) return 'dead'
  if (hours > warn) return 'stale'
  if (lastCount === 0) return 'warn'
  return 'ok'
}

export interface SourceStatusEntry {
  source: string
  lastFetchAt: string
  lastCount: number
  status: SourceStatus
}

export interface SourceHealthReport {
  checkedAt: string
  overallStatus: 'ok' | 'degraded' | 'critical'
  summary: { ok: number; warn: number; stale: number; dead: number }
  sources: SourceStatusEntry[]
}

export async function getSourceStatuses(): Promise<SourceHealthReport> {
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
    const status = computeStatus(row.last_fetch, row.last_count, row.source)
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

  return {
    checkedAt: new Date().toISOString(),
    overallStatus,
    summary,
    sources,
  }
}
