import { after } from 'next/server'
import { fetchIntelligencePhase1 } from '@/lib/pipeline'
import { runCronJob } from '@/lib/cronRuns'
import { runDailyBriefJob } from '@/lib/intelligence/brief'

export const maxDuration = 300

// Phase 1 only — screening + hooks + story threads + entity extraction, the
// Claude-heaviest half. See fetch-intel-2 for phase 2. Split because the
// combined pipeline was regularly exceeding this 300s limit (see git history).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const res = await runCronJob('/api/cron/fetch-intel', () => fetchIntelligencePhase1())

  // Chain the daily brief off successful screening instead of giving it its own
  // cron slot — schedule offsets are not an ordering guarantee (2026-07-14:
  // jitter ran the brief before this route, and it silently skipped on an
  // unscreened window). after() runs post-response within this invocation's
  // maxDuration; the job records its own cron_runs row and is idempotent per
  // date, so the 20:20 run doubles as a same-day retry. On phase-1 failure the
  // chain is skipped — the CRON FAILURE alert already covers that, and a brief
  // attempt would just trip its own data-not-ready gate.
  if (res.ok) {
    after(async () => {
      const brief = await runDailyBriefJob()
      console.log('[fetch-intel] chained brief:', JSON.stringify(brief))
    })
  }
  return res
}
