import { NextResponse } from 'next/server'
import { resolveStoryThread } from '@/lib/intelligence/stories'
import { invalidateContentRoutes } from '@/lib/cache'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await resolveStoryThread(id)
  invalidateContentRoutes()
  return NextResponse.json({ ok: true })
}
