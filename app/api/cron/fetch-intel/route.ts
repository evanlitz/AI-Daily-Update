import { fetchIntelligencePhase1 } from '@/lib/pipeline'
import { runCronJob } from '@/lib/cronRuns'

export const maxDuration = 300

// Phase 1 only — screening + hooks + story threads + entity extraction, the
// Claude-heaviest half. See fetch-intel-2 for phase 2. Split because the
// combined pipeline was regularly exceeding this 300s limit (see git history).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  return runCronJob('/api/cron/fetch-intel', () => fetchIntelligencePhase1())
}
