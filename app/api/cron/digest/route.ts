import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { generateWeeklyDigest } from '@/lib/intelligence/digest'
import { refreshPredictionAnalysis } from '@/lib/intelligence/predictions'
import { getMondayISO } from '@/lib/utils'

export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Only generate once per week — safe to run daily
  const weekStart = getMondayISO()
  const { rows } = await db.execute({
    sql: `SELECT id FROM weekly_digest WHERE week_start = ? LIMIT 1`,
    args: [weekStart],
  })
  if (rows.length > 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'digest already exists for this week' })
  }

  const digest = await generateWeeklyDigest()
  // Refresh prediction timelines once per week alongside the digest
  await refreshPredictionAnalysis().catch(console.error)
  return NextResponse.json({ ok: true, weekStart: digest.week_start })
}
