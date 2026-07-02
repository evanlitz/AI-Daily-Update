import { getSourceStatuses, type SourceStatusEntry, type SourceStatus } from './sourceHealth'
import { getRecentStats, type ClaudeUsageSummary } from './screening-stats'
import { getRecentCronFailures, getFlaggedEvalScores, type CronFailureRow, type EvalFlagRow } from './health'

export interface SourceHealthRow extends SourceStatusEntry {
  accepted: number
  rejected: number
  fastTracked: number
}

export interface HealthDashboard {
  checkedAt: string
  overallStatus: 'ok' | 'degraded' | 'critical'
  summary: { ok: number; warn: number; stale: number; dead: number }
  sources: SourceHealthRow[]
  screening: {
    windowDays: number
    usageByTask: ClaudeUsageSummary[]
    totals: { accepted: number; rejected: number; fastTracked: number }
  }
  cronFailures: CronFailureRow[]
  evalFlags: EvalFlagRow[]
}

const SEVERITY: Record<SourceStatus, number> = { dead: 3, stale: 2, warn: 1, ok: 0 }

export async function getHealthDashboard(): Promise<HealthDashboard> {
  const [sourceReport, screening, cronFailures, evalFlags] = await Promise.all([
    getSourceStatuses(),
    getRecentStats(14),
    getRecentCronFailures(24 * 7),
    getFlaggedEvalScores(),
  ])

  const statusBySource = new Map(sourceReport.sources.map(s => [s.source, s]))
  const screenBySource = new Map(screening.bySource.map(s => [s.source, s]))
  // Union of keys, not an inner join — benchmark-sync only ever writes to
  // source_runs (never goes through Claude screening), so it'd be dropped by
  // an inner join; a source present only in screening_stats but missing from
  // source_runs (shouldn't happen, but not guaranteed) defaults to 'dead'.
  const allSources = new Set([...statusBySource.keys(), ...screenBySource.keys()])

  const sources: SourceHealthRow[] = [...allSources]
    .map(source => {
      const status = statusBySource.get(source)
      const stat = screenBySource.get(source)
      return {
        source,
        lastFetchAt: status?.lastFetchAt ?? '',
        lastCount: status?.lastCount ?? 0,
        status: status?.status ?? 'dead',
        accepted: stat?.accepted ?? 0,
        rejected: stat?.rejected ?? 0,
        fastTracked: stat?.fastTracked ?? 0,
      }
    })
    .sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status] || a.source.localeCompare(b.source))

  const totals = screening.bySource.reduce(
    (acc, s) => ({
      accepted: acc.accepted + s.accepted,
      rejected: acc.rejected + s.rejected,
      fastTracked: acc.fastTracked + s.fastTracked,
    }),
    { accepted: 0, rejected: 0, fastTracked: 0 }
  )

  return {
    checkedAt: sourceReport.checkedAt,
    overallStatus: sourceReport.overallStatus,
    summary: sourceReport.summary,
    sources,
    screening: {
      windowDays: screening.windowDays,
      usageByTask: [...screening.usageByTask].sort(
        (a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)
      ),
      totals,
    },
    cronFailures,
    evalFlags,
  }
}
