import { fetchIntelligence } from '@/lib/pipeline'
import { startCronRun, finishCronRun } from '@/lib/cronRuns'

export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const runId = await startCronRun('/api/cron/fetch-intel')
  try {
    await fetchIntelligence()
    await finishCronRun(runId, 'success')
    return Response.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cron/fetch-intel] failed:', err)
    await finishCronRun(runId, 'failed', msg)
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}
