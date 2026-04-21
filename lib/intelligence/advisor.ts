import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL } from '../claude'
import type { ProjectIdea } from '../types'

export async function generateProjectIdeas(): Promise<ProjectIdea[]> {
  const day14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const day30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const recentItems = db.prepare(
    `SELECT title, raw_content FROM feed_items
     WHERE fetched_at >= ? AND velocity_score > 0
     ORDER BY velocity_score DESC LIMIT 10`
  ).all(day14) as any[]

  const existingIdeas = db.prepare(
    `SELECT title FROM project_ideas WHERE created_at >= ?`
  ).all(day30) as any[]

  const itemSummary   = recentItems.map(i => `- ${i.title}`).join('\n')
  const existingTitles = existingIdeas.map((i: any) => i.title).join(', ')

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2500,
    system: [
      {
        type: 'text',
        text: 'You are a senior developer mentoring a self-taught developer learning AI/ML. Suggest realistic, achievable projects that: (1) can be built solo in 1-20 hours, (2) use cutting-edge AI tools to look impressive, (3) teach real skills, (4) have a clear "wow factor". The developer knows basic Python and JavaScript and is comfortable with APIs.',
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Based on these recent AI developments:\n${itemSummary}\n\n${existingTitles ? `Avoid repeating: ${existingTitles}\n\n` : ''}Suggest exactly 3 project ideas as a JSON array (no markdown fences):\n[{"title": "...", "description": "2-3 sentences", "difficulty": 1-5, "skills_learned": ["skill1", "skill2"], "estimated_hours": 5, "tech_stack": ["React", "Claude API", "SQLite"], "starter_checklist": ["step 1", "step 2", "step 3", "step 4"]}]\n\nFor tech_stack, list 3-6 specific named technologies the project actually uses (e.g. "Next.js", "Claude API", "Python", "FastAPI", "Tailwind CSS"). Be specific, not generic.`,
      },
    ],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : '[]'

  let ideas: any[] = []
  try {
    const match = content.match(/\[[\s\S]*\]/)
    if (match) ideas = JSON.parse(match[0])
  } catch {
    ideas = []
  }

  const now = new Date().toISOString()
  const insertStmt = db.prepare(
    `INSERT INTO project_ideas (id, title, description, difficulty, skills_learned, estimated_hours, starter_checklist, tech_stack, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const result: ProjectIdea[] = []
  const txn = db.transaction(() => {
    for (const idea of ideas.slice(0, 3)) {
      const id = crypto.randomUUID()
      insertStmt.run(
        id,
        idea.title ?? 'Untitled',
        idea.description ?? '',
        idea.difficulty ?? 3,
        JSON.stringify(idea.skills_learned ?? []),
        idea.estimated_hours ?? 5,
        JSON.stringify(idea.starter_checklist ?? []),
        JSON.stringify(idea.tech_stack ?? []),
        now,
      )
      result.push({
        id,
        title: idea.title ?? 'Untitled',
        description: idea.description ?? '',
        difficulty: idea.difficulty ?? 3,
        skills_learned: idea.skills_learned ?? [],
        estimated_hours: idea.estimated_hours ?? 5,
        starter_checklist: idea.starter_checklist ?? [],
        tech_stack: idea.tech_stack ?? [],
        created_at: now,
      })
    }
  })
  txn()

  return result
}
