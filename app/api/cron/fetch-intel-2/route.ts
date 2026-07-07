import { fetchIntelligencePhase2 } from '@/lib/pipeline'
import { startCronRun, finishCronRun } from '@/lib/cronRuns'

export const maxDuration = 300

// Phase 2 — DB-driven only (thread linking, prediction/entity backfill, radar,
// pruning, acceleration scores). Runs as its own invocation so it isn't at risk
// of being starved by phase 1's Claude calls within a single 300s budget.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const runId = await startCronRun('/api/cron/fetch-intel-2')
  try {
    await fetchIntelligencePhase2()
    await finishCronRun(runId, 'success')
    return Response.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cron/fetch-intel-2] failed:', err)
    await finishCronRun(runId, 'failed', msg)
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}
