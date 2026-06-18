import { NextResponse } from 'next/server'
import { refineProjectIdea } from '@/lib/intelligence/advisor'
import { checkCooldown } from '@/lib/rateLimiter'

export const maxDuration = 60

export async function POST(req: Request) {
  let body: any = {}
  try { body = await req.json() } catch {}

  const ideaId  = typeof body.ideaId === 'string' ? body.ideaId : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!ideaId || !message) return NextResponse.json({ error: 'ideaId and message are required' }, { status: 400 })

  const { ok, retryAfterMs } = checkCooldown(`refine:${ideaId}`, 10 * 1000)
  if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } })

  try {
    return NextResponse.json(await refineProjectIdea(ideaId, message))
  } catch (err) {
    console.error('[advisor/refine]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
