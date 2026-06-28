import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { generateWeeklyDigest } from '@/lib/intelligence/digest'
import { getMondayISO } from '@/lib/utils'
import { startCronRun, finishCronRun } from '@/lib/cronRuns'

export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const weekStart = getMondayISO()
  const { rows } = await db.execute({
    sql: `SELECT id FROM weekly_digest WHERE week_start = ? LIMIT 1`,
    args: [weekStart],
  })
  if (rows.length > 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'digest already exists for this week' })
  }

  const runId = await startCronRun('/api/cron/digest')
  try {
    const digest = await generateWeeklyDigest()
    await finishCronRun(runId, 'success')
    return NextResponse.json({ ok: true, weekStart: digest.week_start })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await finishCronRun(runId, 'failed', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
