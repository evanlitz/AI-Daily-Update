import { NextResponse } from 'next/server'
import { generateDailyBrief } from '@/lib/intelligence/brief'

export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const brief = await generateDailyBrief()
  if (!brief) {
    return NextResponse.json({ ok: true, skipped: true })
  }
  return NextResponse.json({ ok: true, date: brief.date })
}
