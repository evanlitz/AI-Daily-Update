import db from './db'

export interface HealthFailure {
  check: string
  detail: string
}

const STALE_FEED_HOURS = 12
const SOURCE_MIN_HISTORICAL_RUNS = 3
const SOURCE_MIN_HISTORICAL_AVG = 3

export async function runHealthChecks(): Promise<HealthFailure[]> {
  const failures: HealthFailure[] = []
  const now = new Date()
  const since12h = new Date(now.getTime() - STALE_FEED_HOURS * 3600_000).toISOString()
  const since30d = new Date(now.getTime() - 30 * 24 * 3600_000).toISOString()
  const today = now.toISOString().split('T')[0]

  await Promise.all([
    checkFeedStaleness(failures, since12h, now),
    checkSourceSilence(failures, since12h, since30d),
    checkMissingBrief(failures, today),
    checkCronFailures(failures),
    checkEvalQuality(failures),
  ])

  return failures
}

async function checkFeedStaleness(failures: HealthFailure[], since12h: string, now: Date): Promise<void> {
  try {
    const { rows } = await db.execute(`SELECT MAX(fetched_at) as last_fetch FROM feed_items`)
    const lastFetch = (rows[0] as any)?.last_fetch as string | null
    if (!lastFetch) {
      failures.push({ check: 'FEED STALE', detail: 'No items in feed_items table.' })
      return
    }
    const ageHours = (now.getTime() - new Date(lastFetch).getTime()) / 3600_000
    if (ageHours > STALE_FEED_HOURS) {
      failures.push({
        check: 'FEED STALE',
        detail: `Last ingest was ${Math.round(ageHours)}h ago (threshold: ${STALE_FEED_HOURS}h). Last fetch: ${lastFetch}.`,
      })
    }
  } catch (err) {
    failures.push({ check: 'FEED STALE', detail: `Check failed: ${err instanceof Error ? err.message : String(err)}` })
  }
}

async function checkSourceSilence(failures: HealthFailure[], since12h: string, since30d: string): Promise<void> {
  try {
    const { rows } = await db.execute({
      sql: `
        SELECT
          recent.source,
          recent.item_count AS today_count,
          hist.avg_count,
          hist.run_count
        FROM (
          SELECT source, MAX(item_count) AS item_count
          FROM source_runs
          WHERE fetched_at >= ?
          GROUP BY source
        ) recent
        JOIN (
          SELECT source, AVG(item_count) AS avg_count, COUNT(*) AS run_count
          FROM source_runs
          WHERE fetched_at >= ? AND fetched_at < ?
          GROUP BY source
          HAVING run_count >= ? AND AVG(item_count) > ?
        ) hist ON recent.source = hist.source
        WHERE recent.item_count = 0
        ORDER BY hist.avg_count DESC
      `,
      args: [since12h, since30d, since12h, SOURCE_MIN_HISTORICAL_RUNS, SOURCE_MIN_HISTORICAL_AVG],
    })

    for (const row of rows as any[]) {
      failures.push({
        check: `SOURCE SILENCE — ${row.source}`,
        detail: `Returned 0 items today. 30-day average: ${Number(row.avg_count).toFixed(1)} items/run (over ${row.run_count} runs).`,
      })
    }
  } catch (err) {
    failures.push({ check: 'SOURCE SILENCE', detail: `Check failed: ${err instanceof Error ? err.message : String(err)}` })
  }
}

async function checkMissingBrief(failures: HealthFailure[], today: string): Promise<void> {
  try {
    const { rows } = await db.execute({
      sql: `SELECT id FROM daily_briefs WHERE date = ?`,
      args: [today],
    })
    if (rows.length === 0) {
      failures.push({
        check: 'MISSING BRIEF',
        detail: `No brief was generated for ${today}. Brief cron ran at 8:45am UTC — check cron_runs for the failure.`,
      })
    }
  } catch (err) {
    failures.push({ check: 'MISSING BRIEF', detail: `Check failed: ${err instanceof Error ? err.message : String(err)}` })
  }
}

export interface EvalFlagRow {
  targetType: string
  targetId: string
  groundedness: number | null
  rationale: string | null
  createdAt: string
}

// Cases the live groundedness judge (lib/eval/live-check.ts) flagged after a
// real digest/brief generation. Stays flagged until scripts/eval/export-flagged.mts
// marks it exported=1 — deliberate, since that script is also the human review
// step before it becomes a fixture.
export async function getFlaggedEvalScores(): Promise<EvalFlagRow[]> {
  const { rows } = await db.execute(
    `SELECT target_type, target_id, groundedness, rationale, created_at
     FROM eval_scores WHERE flagged = 1 AND exported = 0
     ORDER BY created_at DESC`
  )
  return (rows as any[]).map(row => ({
    targetType: row.target_type as string,
    targetId: row.target_id as string,
    groundedness: row.groundedness as number | null,
    rationale: row.rationale as string | null,
    createdAt: row.created_at as string,
  }))
}

async function checkEvalQuality(failures: HealthFailure[]): Promise<void> {
  try {
    const rows = await getFlaggedEvalScores()
    for (const row of rows) {
      failures.push({
        check: `EVAL QUALITY — ${row.targetType} ${row.targetId}`,
        detail: `Groundedness ${row.groundedness}/5 — ${row.rationale ?? 'no rationale recorded'}. Run scripts/eval/export-flagged.mts to review.`,
      })
    }
  } catch (err) {
    failures.push({ check: 'EVAL QUALITY', detail: `Check failed: ${err instanceof Error ? err.message : String(err)}` })
  }
}

export interface CronFailureRow {
  path: string
  startedAt: string
  errorText: string | null
}

// Functions killed by their route's own `maxDuration` (or a crash before the
// catch block runs) never reach finishCronRun() and stay stuck at
// status='running' forever — the largest maxDuration across all cron routes
// is 300s, so anything still 'running' well past that has definitely died,
// not just run long. Treated as a failure here so a hang isn't invisible to
// both the alert check and the dashboard.
const STUCK_CRON_MINUTES = 10

export async function getRecentCronFailures(hours: number): Promise<CronFailureRow[]> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString()
  const stuckBefore = new Date(Date.now() - STUCK_CRON_MINUTES * 60_000).toISOString()
  const { rows } = await db.execute({
    sql: `
      SELECT path, started_at, status, error_text
      FROM cron_runs
      WHERE started_at >= ?
        AND (status = 'failed' OR (status = 'running' AND started_at < ?))
      ORDER BY started_at DESC
    `,
    args: [since, stuckBefore],
  })
  return (rows as any[]).map(row => ({
    path: row.path as string,
    startedAt: row.started_at as string,
    errorText: row.status === 'running'
      ? `Still marked "running" after ${STUCK_CRON_MINUTES} minutes — likely timed out or crashed before it could record a failure.`
      : (row.error_text as string | null),
  }))
}

async function checkCronFailures(failures: HealthFailure[]): Promise<void> {
  try {
    const rows = await getRecentCronFailures(24)
    for (const row of rows) {
      const time = new Date(row.startedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
      failures.push({
        check: `CRON FAILURE — ${row.path} (${time})`,
        detail: row.errorText ?? 'No error detail recorded.',
      })
    }
  } catch (err) {
    failures.push({ check: 'CRON FAILURE', detail: `Check failed: ${err instanceof Error ? err.message : String(err)}` })
  }
}
