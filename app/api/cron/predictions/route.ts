import { NextResponse } from 'next/server'
import { refreshPredictionAnalysis, checkPredictionResolution, generateNewPredictions } from '@/lib/intelligence/predictions'
import { startCronRun, finishCronRun } from '@/lib/cronRuns'

export const maxDuration = 180

// Scheduled weekly (not daily-with-a-guard like /api/cron/digest) — the cron
// schedule itself enforces the cadence, so there's no "already ran this week"
// check here. That also means it's always safely re-runnable on demand: each
// of the three calls is idempotent (refresh no-ops with no feed signal,
// resolution only touches non-'past' rows, generation dedupes against
// existing titles), so a manual curl during testing or a retry after a
// partial failure can't double up side effects.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const runId = await startCronRun('/api/cron/predictions')

  // Each step is independently idempotent (see above), so one step's failure
  // shouldn't block the others from still running this week — but a failure
  // must be visible, not just logged: without a cron_runs row here, a total
  // failure of all three was previously invisible to /health and health-notify.
  const errors: string[] = []
  await refreshPredictionAnalysis().catch(err => errors.push(`refreshPredictionAnalysis: ${err instanceof Error ? err.message : String(err)}`))
  await checkPredictionResolution().catch(err => errors.push(`checkPredictionResolution: ${err instanceof Error ? err.message : String(err)}`))
  await generateNewPredictions().catch(err => errors.push(`generateNewPredictions: ${err instanceof Error ? err.message : String(err)}`))

  if (errors.length > 0) {
    const message = errors.join('\n')
    console.error('[cron/predictions] failed:', message)
    await finishCronRun(runId, 'failed', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  await finishCronRun(runId, 'success')
  return NextResponse.json({ ok: true })
}
