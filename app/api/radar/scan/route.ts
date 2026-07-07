import { NextResponse } from 'next/server'
import { scanAllFeedItems, seedRadarIfEmpty } from '@/lib/intelligence/radar'
import { checkCooldown } from '@/lib/rateLimiter'

// Manual-only trigger — the pipeline's automatic radar population comes from
// Claude's own tool extraction during screening (hooks.ts), not from here.
// scanAllFeedItems() runs the regex-based full-text scan (see its doc comment
// in radar.ts) as an on-demand fuller sweep; hit this route by hand when you
// want one, it's never called by cron.

export async function POST() {
  const { ok, retryAfterMs } = checkCooldown('radar-scan', 5 * 60 * 1000)
  if (!ok) return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } })
  try {
    await seedRadarIfEmpty()
    const total = await scanAllFeedItems()
    return NextResponse.json({ ok: true, total })
  } catch (err) {
    console.error('[radar/scan]', err)
    return NextResponse.json({ error: 'Classification failed' }, { status: 500 })
  }
}
