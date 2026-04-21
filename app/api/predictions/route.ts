import { NextResponse } from 'next/server'
import { ensureAllPredictions, getAllPredictions } from '@/lib/intelligence/predictions'

export async function GET() {
  await ensureAllPredictions()
  return NextResponse.json(getAllPredictions())
}
