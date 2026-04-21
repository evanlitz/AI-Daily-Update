import { NextResponse } from 'next/server'
import { updateVelocityScores } from '@/lib/intelligence/velocity'

// POST /api/velocity — recalculate velocity scores for all feed items immediately
export async function POST() {
  updateVelocityScores()
  return NextResponse.json({ ok: true })
}
