import { NextResponse } from 'next/server'
import { refreshPredictionAnalysis, getAllPredictions } from '@/lib/intelligence/predictions'
import { checkCooldown } from '@/lib/rateLimiter'

export async function POST() {
  const { ok, retryAfterMs } = checkCooldown('predictions-generate', 5 * 60 * 1000)
  if (!ok) return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } })
  try {
    await refreshPredictionAnalysis()
    return NextResponse.json(await getAllPredictions())
  } catch (err) {
    console.error('[predictions/generate]', err)
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 })
  }
}
