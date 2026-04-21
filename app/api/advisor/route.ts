import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { generateProjectIdeas } from '@/lib/intelligence/advisor'

function getStoredIdeas() {
  const ideas = db.prepare(`SELECT * FROM project_ideas ORDER BY created_at DESC LIMIT 3`).all() as any[]
  return ideas.map(idea => ({
    ...idea,
    skills_learned:    JSON.parse(idea.skills_learned    ?? '[]'),
    starter_checklist: JSON.parse(idea.starter_checklist ?? '[]'),
    tech_stack:        JSON.parse(idea.tech_stack        ?? '[]'),
  }))
}

export async function GET() {
  const stored = getStoredIdeas()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const needsRefresh = stored.length < 3 || stored[0]?.created_at < sevenDaysAgo

  if (needsRefresh) {
    try {
      const fresh = await generateProjectIdeas()
      return NextResponse.json(fresh)
    } catch (err) {
      console.error('[advisor]', err)
      return NextResponse.json(stored)
    }
  }

  return NextResponse.json(stored)
}

export async function POST() {
  try {
    const ideas = await generateProjectIdeas()
    return NextResponse.json(ideas)
  } catch (err) {
    console.error('[advisor POST]', err)
    return NextResponse.json({ error: 'Failed to generate ideas' }, { status: 500 })
  }
}
