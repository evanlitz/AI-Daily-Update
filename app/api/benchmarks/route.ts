import { NextResponse } from 'next/server'
import { updateBenchmarks } from '@/lib/intelligence/benchmarks'

export async function POST() {
  try {
    const result = await updateBenchmarks()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
