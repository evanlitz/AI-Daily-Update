import { NextResponse } from 'next/server'
import { getHealthDashboard } from '@/lib/health-dashboard'

export async function GET() {
  return NextResponse.json(await getHealthDashboard())
}
