import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL } from '../claude'
import type { ProjectIdea } from '../types'

export interface AdvisorContext {
  level?: 'beginner' | 'intermediate' | 'advanced'
  interests?: string[]
  hoursPerWeek?: number
}

export async function generateCustomProjectIdeas(userInput: string, context?: AdvisorContext): Promise<ProjectIdea[]> {
  const day14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const [{ rows: recentItems }, { rows: radarRows }] = await Promise.all([
    db.execute({ sql: `SELECT title FROM feed_items WHERE fetched_at >= ? AND velocity_score > 0 ORDER BY velocity_score DESC LIMIT 12`, args: [day14] }),
    db.execute(`SELECT name, category, quadrant FROM tech_radar WHERE quadrant IN ('adopt', 'trial') ORDER BY quadrant ASC, name ASC`),
  ])

  const itemSummary = (recentItems as any[]).map(i => `- ${i.title}`).join('\n') || 'No recent items available.'
  const radarContext = (radarRows as any[]).map(r => `- ${r.name} (${r.category}, ${r.quadrant})`).join('\n') || 'No radar data available.'

  const contextLines = [
    context?.level ? `Experience level: ${context.level}.` : '',
    context?.hoursPerWeek ? `Available ~${context.hoursPerWeek} hours per week.` : '',
  ].filter(Boolean).join(' ')

  const systemText = `You are a senior developer mentor helping a self-taught AI developer find their next project. Your job is to take what the user describes — a topic, problem, or vague idea — and turn it into 3 concrete, achievable project ideas using today's best AI tools.

The developer knows basic Python and JavaScript and is comfortable with APIs. ${contextLines}

Rules:
- Never replace the user's stated intent — build on it and ground it in current AI tooling
- If they describe a problem, design projects that solve that exact problem
- Each of the 3 ideas must take a meaningfully different angle on their description
- Pick tools from the current AI landscape below when relevant
- Scope each project to 1-20 hours of solo work

Current trending AI developments:
${itemSummary}

Currently recommended AI tools (adopt/trial):
${radarContext}`

  const response = await anthropic.messages.create({
    model: MODEL, max_tokens: 2500,
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `The user described what they want to build or a problem they're facing:\n\n"${userInput}"\n\nSuggest exactly 3 project ideas directly tied to this description. Return JSON array only — no markdown fences:\n[{"title":"...","description":"2-3 sentences","difficulty":1-5,"skills_learned":["..."],"estimated_hours":5,"tech_stack":["..."],"starter_checklist":["step 1","step 2","step 3","step 4"]}]` }],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : '[]'
  let ideas: any[] = []
  try { const m = content.match(/\[[\s\S]*\]/); if (m) ideas = JSON.parse(m[0]) } catch {}

  return ideas.slice(0, 3).map(idea => ({
    id: crypto.randomUUID(),
    title: idea.title ?? 'Untitled',
    description: idea.description ?? '',
    difficulty: idea.difficulty ?? 3,
    skills_learned: idea.skills_learned ?? [],
    estimated_hours: idea.estimated_hours ?? 5,
    starter_checklist: idea.starter_checklist ?? [],
    tech_stack: idea.tech_stack ?? [],
    created_at: new Date().toISOString(),
  }))
}

export async function generateProjectIdeas(context?: AdvisorContext): Promise<ProjectIdea[]> {
  const day14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const day30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [{ rows: recentItems }, { rows: existingIdeas }, { rows: radarRows }] = await Promise.all([
    db.execute({ sql: `SELECT title FROM feed_items WHERE fetched_at >= ? AND velocity_score > 0 ORDER BY velocity_score DESC LIMIT 10`, args: [day14] }),
    db.execute({ sql: `SELECT title FROM project_ideas WHERE created_at >= ?`, args: [day30] }),
    db.execute(`SELECT name, category, quadrant FROM tech_radar WHERE quadrant IN ('adopt', 'trial') ORDER BY quadrant ASC, name ASC`),
  ])

  const itemSummary    = (recentItems as any[]).map(i => `- ${i.title}`).join('\n')
  const existingTitles = (existingIdeas as any[]).map(i => i.title).join(', ')
  const radarContext   = (radarRows as any[]).map(r => `- ${r.name} (${r.category}, ${r.quadrant})`).join('\n') || 'No radar data available.'

  const contextLines = [
    context?.level ? `Experience level: ${context.level}.` : '',
    context?.interests?.length ? `Interested in: ${context.interests.join(', ')}.` : '',
    context?.hoursPerWeek ? `Available ~${context.hoursPerWeek} hours per week — calibrate project scope accordingly.` : '',
  ].filter(Boolean).join(' ')

  const systemText = `You are a senior developer mentoring a self-taught developer learning AI/ML. ${contextLines} Suggest realistic, achievable projects that: (1) can be built solo in 1-20 hours, (2) use current AI tools from the list below, (3) teach real skills, (4) produce a tangible shareable output — an API, demo app, or CLI tool a developer can show. The developer knows basic Python and JavaScript and is comfortable with APIs.

Currently recommended AI tools (adopt/trial):
${radarContext}`

  const response = await anthropic.messages.create({
    model: MODEL, max_tokens: 2500,
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Based on these recent AI developments:\n${itemSummary}\n\n${existingTitles ? `Avoid repeating: ${existingTitles}\n\n` : ''}Suggest exactly 3 project ideas as a JSON array (no markdown fences):\n[{"title": "...", "description": "2-3 sentences", "difficulty": 1-5, "skills_learned": ["skill1"], "estimated_hours": 5, "tech_stack": ["React", "Claude API"], "starter_checklist": ["step 1", "step 2", "step 3", "step 4"]}]` }],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : '[]'
  let ideas: any[] = []
  try { const m = content.match(/\[[\s\S]*\]/); if (m) ideas = JSON.parse(m[0]) } catch {}

  const now = new Date().toISOString()
  const result: ProjectIdea[] = []

  for (const idea of ideas.slice(0, 3)) {
    const id = crypto.randomUUID()
    await db.execute({
      sql: `INSERT INTO project_ideas (id, title, description, difficulty, skills_learned, estimated_hours, starter_checklist, tech_stack, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, idea.title ?? 'Untitled', idea.description ?? '', idea.difficulty ?? 3, JSON.stringify(idea.skills_learned ?? []), idea.estimated_hours ?? 5, JSON.stringify(idea.starter_checklist ?? []), JSON.stringify(idea.tech_stack ?? []), now],
    })
    result.push({ id, title: idea.title ?? 'Untitled', description: idea.description ?? '', difficulty: idea.difficulty ?? 3, skills_learned: idea.skills_learned ?? [], estimated_hours: idea.estimated_hours ?? 5, starter_checklist: idea.starter_checklist ?? [], tech_stack: idea.tech_stack ?? [], created_at: now })
  }
  return result
}
