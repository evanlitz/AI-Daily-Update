import { NextResponse } from 'next/server'
import { generateDailyBrief } from '@/lib/intelligence/brief'
import { startCronRun, finishCronRun } from '@/lib/cronRuns'

export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const runId = await startCronRun('/api/cron/brief')
  try {
    const brief = await generateDailyBrief()
    if (!brief) {
      await finishCronRun(runId, 'success')
      return NextResponse.json({ ok: true, skipped: true })
    }
    await finishCronRun(runId, 'success')
    return NextResponse.json({ ok: true, date: brief.date })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await finishCronRun(runId, 'failed', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
