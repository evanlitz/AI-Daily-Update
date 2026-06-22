import { NextResponse } from 'next/server'
import { getRecentStats } from '@/lib/screening-stats'

export async function GET() {
  const stats = await getRecentStats()
  return NextResponse.json(stats)
}
