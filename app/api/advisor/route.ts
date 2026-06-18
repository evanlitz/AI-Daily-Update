import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { generateProjectIdeas } from '@/lib/intelligence/advisor'
import { checkCooldown } from '@/lib/rateLimiter'

export const maxDuration = 60

async function getStoredIdeas() {
  const { rows } = await db.execute(`SELECT * FROM project_ideas WHERE source = 'trending' ORDER BY created_at DESC LIMIT 3`)
  return (rows as any[]).map(idea => ({
    ...idea,
    skills_learned:    JSON.parse(idea.skills_learned    ?? '[]'),
    starter_checklist: JSON.parse(idea.starter_checklist ?? '[]'),
    tech_stack:        JSON.parse(idea.tech_stack        ?? '[]'),
    refinement_log:    JSON.parse(idea.refinement_log    ?? '[]'),
  }))
}

export async function GET() {
  const stored = await getStoredIdeas()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const needsRefresh = stored.length < 3 || stored[0]?.created_at < sevenDaysAgo
  if (needsRefresh) {
    try { return NextResponse.json(await generateProjectIdeas()) } catch (err) {
      console.error('[advisor]', err)
      return NextResponse.json(stored)
    }
  }
  return NextResponse.json(stored)
}

export async function POST(req: Request) {
  const { ok, retryAfterMs } = checkCooldown('advisor', 3 * 60 * 1000)
  if (!ok) return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } })
  let context: any = undefined
  try { context = await req.json() } catch {}
  try { return NextResponse.json(await generateProjectIdeas(context)) }
  catch (err) { console.error('[advisor POST]', err); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
