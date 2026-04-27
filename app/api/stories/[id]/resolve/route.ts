import { NextResponse } from 'next/server'
import { resolveStoryThread } from '@/lib/intelligence/stories'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await resolveStoryThread(id)
  return NextResponse.json({ ok: true })
}
