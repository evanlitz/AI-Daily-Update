import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { generateWeeklyDigest } from '@/lib/intelligence/digest'
import { getMondayISO } from '@/lib/utils'

export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

  const digest = await generateWeeklyDigest()
  return NextResponse.json({ ok: true, weekStart: digest.week_start })
}
