import { NextResponse } from 'next/server'
import { generateWeeklyDigest } from '@/lib/intelligence/digest'
import { checkCooldown } from '@/lib/rateLimiter'

export async function POST() {
  const { ok, retryAfterMs } = checkCooldown('digest', 5 * 60 * 1000)
  if (!ok) return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } })
  try {
    const digest = await generateWeeklyDigest()
    return NextResponse.json(digest)
  } catch (err) {
    console.error('[digest/generate]', err)
    return NextResponse.json({ error: 'Failed to generate digest' }, { status: 500 })
  }
}
