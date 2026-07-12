import { fetchIntelligencePhase2 } from '@/lib/pipeline'
import { runCronJob } from '@/lib/cronRuns'

export const maxDuration = 300

// Phase 2 — DB-driven only (thread linking, prediction/entity backfill, radar,
// pruning, acceleration scores). Runs as its own invocation so it isn't at risk
// of being starved by phase 1's Claude calls within a single 300s budget.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  return runCronJob('/api/cron/fetch-intel-2', () => fetchIntelligencePhase2())
}
