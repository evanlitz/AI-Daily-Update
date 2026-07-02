import { NextResponse } from 'next/server'
import { getSourceStatuses } from '@/lib/sourceHealth'

export async function GET() {
  return NextResponse.json(await getSourceStatuses())
}
