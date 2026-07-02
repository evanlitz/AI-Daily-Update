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
  const since24h = new Date(now.getTime() - 24 * 3600_000).toISOString()
  const today = now.toISOString().split('T')[0]

  await Promise.all([
    checkFeedStaleness(failures, since12h, now),
    checkSourceSilence(failures, since12h, since30d),
    checkMissingBrief(failures, today),
    checkCronFailures(failures, since24h),
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

// Cases the live groundedness judge (lib/eval/live-check.ts) flagged after a
// real digest/brief generation. Stays in the alert on every run until
// scripts/eval/export-flagged.mts marks it exported=1 — deliberate, since
// that script is also the human review step before it becomes a fixture.
async function checkEvalQuality(failures: HealthFailure[]): Promise<void> {
  try {
    const { rows } = await db.execute(
      `SELECT target_type, target_id, groundedness, rationale, created_at
       FROM eval_scores WHERE flagged = 1 AND exported = 0
       ORDER BY created_at DESC`
    )

    for (const row of rows as any[]) {
      failures.push({
        check: `EVAL QUALITY — ${row.target_type} ${row.target_id}`,
        detail: `Groundedness ${row.groundedness}/5 — ${row.rationale ?? 'no rationale recorded'}. Run scripts/eval/export-flagged.mts to review.`,
      })
    }
  } catch (err) {
    failures.push({ check: 'EVAL QUALITY', detail: `Check failed: ${err instanceof Error ? err.message : String(err)}` })
  }
}

async function checkCronFailures(failures: HealthFailure[], since24h: string): Promise<void> {
  try {
    const { rows } = await db.execute({
      sql: `
        SELECT path, started_at, error_text
        FROM cron_runs
        WHERE status = 'failed' AND started_at >= ?
        ORDER BY started_at DESC
      `,
      args: [since24h],
    })

    for (const row of rows as any[]) {
      const time = new Date(row.started_at as string).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
      failures.push({
        check: `CRON FAILURE — ${row.path} (${time})`,
        detail: row.error_text ?? 'No error detail recorded.',
      })
    }
  } catch (err) {
    failures.push({ check: 'CRON FAILURE', detail: `Check failed: ${err instanceof Error ? err.message : String(err)}` })
  }
}
