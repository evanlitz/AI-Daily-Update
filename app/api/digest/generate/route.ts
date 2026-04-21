import { NextResponse } from 'next/server'
import { generateWeeklyDigest } from '@/lib/intelligence/digest'

export async function POST() {
  try {
    const digest = await generateWeeklyDigest()
    return NextResponse.json(digest)
  } catch (err) {
    console.error('[digest/generate]', err)
    return NextResponse.json({ error: 'Failed to generate digest' }, { status: 500 })
  }
}
