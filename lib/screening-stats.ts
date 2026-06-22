import db from './db'

export interface SourceScreeningSummary {
  source: string
  accepted: number
  rejected: number
  fastTracked: number
}

export interface ClaudeUsageSummary {
  task: string
  inputTokens: number
  outputTokens: number
}

export interface DailySourceStat extends SourceScreeningSummary {
  day: string
}

export interface RecentStats {
  windowDays: number
  bySource: SourceScreeningSummary[]
  usageByTask: ClaudeUsageSummary[]
  daily: DailySourceStat[]
}

// Aggregates lib/intelligence/hooks.ts's per-run screening_stats/claude_usage
// writes into a single read so /api/screening-stats can answer "where is the
// noise and the Claude spend actually coming from" without raw SQL.
// `bySource` collapses the whole window into one number per source (good for
// "is this source bad overall"); `daily` keeps day-by-day rows per source (good
// for "is mit-tech-review's accept rate trending up or staying at zero") — the
// underlying screening_stats rows already have per-run timestamps, so nothing
// new is recorded here, this just reads the existing history two ways.
export async function getRecentStats(windowDays = 14): Promise<RecentStats> {
  const sinceISO = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  const [{ rows: sourceRows }, { rows: usageRows }, { rows: dailyRows }] = await Promise.all([
    db.execute({
      sql: `SELECT source,
                   SUM(accepted_count) AS accepted,
                   SUM(rejected_count) AS rejected,
                   SUM(fast_tracked_count) AS fast_tracked
            FROM screening_stats
            WHERE run_at >= ?
            GROUP BY source
            ORDER BY (accepted + rejected + fast_tracked) DESC`,
      args: [sinceISO],
    }),
    db.execute({
      sql: `SELECT task, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens
            FROM claude_usage
            WHERE run_at >= ?
            GROUP BY task`,
      args: [sinceISO],
    }),
    db.execute({
      sql: `SELECT date(run_at) AS day, source,
                   SUM(accepted_count) AS accepted,
                   SUM(rejected_count) AS rejected,
                   SUM(fast_tracked_count) AS fast_tracked
            FROM screening_stats
            WHERE run_at >= ?
            GROUP BY day, source
            ORDER BY day DESC, source ASC`,
      args: [sinceISO],
    }),
  ])

  return {
    windowDays,
    bySource: (sourceRows as any[]).map(r => ({
      source: r.source as string,
      accepted: r.accepted as number,
      rejected: r.rejected as number,
      fastTracked: r.fast_tracked as number,
    })),
    usageByTask: (usageRows as any[]).map(r => ({
      task: r.task as string,
      inputTokens: r.input_tokens as number,
      outputTokens: r.output_tokens as number,
    })),
    daily: (dailyRows as any[]).map(r => ({
      day: r.day as string,
      source: r.source as string,
      accepted: r.accepted as number,
      rejected: r.rejected as number,
      fastTracked: r.fast_tracked as number,
    })),
  }
}
