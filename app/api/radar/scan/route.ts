import { NextResponse } from 'next/server'
import { scanAllFeedItems, seedRadarIfEmpty } from '@/lib/intelligence/radar'

export async function POST() {
  try {
    await seedRadarIfEmpty()
    const total = await scanAllFeedItems()
    return NextResponse.json({ ok: true, total })
  } catch (err) {
    console.error('[radar/scan]', err)
    return NextResponse.json({ error: 'Classification failed' }, { status: 500 })
  }
}
