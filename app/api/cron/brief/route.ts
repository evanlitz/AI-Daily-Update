import { NextResponse } from 'next/server'
import { runDailyBriefJob } from '@/lib/intelligence/brief'

export const maxDuration = 60

// Manual/retry trigger only — the scheduled path is chained off
// /api/cron/fetch-intel so the brief can never run before screening has
// written hooks (schedule-offset ordering lost to Vercel cron jitter on
// 2026-07-14). Idempotent per date, so re-triggering is always safe.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await runDailyBriefJob()
  return NextResponse.json(result, result.ok ? undefined : { status: 500 })
}
