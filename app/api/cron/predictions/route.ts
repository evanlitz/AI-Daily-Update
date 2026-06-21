import { NextResponse } from 'next/server'
import { refreshPredictionAnalysis, checkPredictionResolution, generateNewPredictions } from '@/lib/intelligence/predictions'

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

  await refreshPredictionAnalysis().catch(console.error)
  await checkPredictionResolution().catch(console.error)
  await generateNewPredictions().catch(console.error)

  return NextResponse.json({ ok: true })
}
