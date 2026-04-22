import { NextResponse } from 'next/server'
import { refreshPredictionAnalysis, getAllPredictions } from '@/lib/intelligence/predictions'

export async function POST() {
  try {
    await refreshPredictionAnalysis()
    return NextResponse.json(await getAllPredictions())
  } catch (err) {
    console.error('[predictions/generate]', err)
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 })
  }
}
