import { fetchAll } from '@/lib/pipeline'
import { NextResponse } from 'next/server'

export async function POST() {
  const newItems = await fetchAll()
  return NextResponse.json({ ok: true, newItems })
}
