import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL } from '../claude'
import { safeJSON } from '../utils'
import { recall, rememberEntity } from '../memory'
import { gatherAdvisorContext } from './advisor-context'
import type { AdvisorSourceContext } from './advisor-context'
import type { ProjectIdea, IdeaRefinementMessage } from '../types'

export interface AdvisorContext {
  level?: 'beginner' | 'intermediate' | 'advanced'
  interests?: string[]
  hoursPerWeek?: number
}

// Distance below which a new candidate idea is treated as a semantic
// duplicate of one already shown to the user (Voyage cosine distance, 0 =
// identical). Starting value — tune after watching real skip logs.
const SEMANTIC_DUPLICATE_THRESHOLD = 0.15

// Shared by generateProjectIdeas and generateCustomProjectIdeas — both produce
// the same shape from Claude and need it persisted so refinement has a row to
// attach its log to. Returns null (and logs) if the idea is a semantic
// duplicate of one already shown — this is the single dedup gate for both
// modes, since neither had a code-enforced check before (trending only asked
// Claude nicely in-prompt; custom had none at all).
async function persistIdea(raw: any, source: 'trending' | 'custom'): Promise<ProjectIdea | null> {
  const title = raw.title ?? 'Untitled'
  const description = raw.description ?? ''

  const semanticMatch = await recall(`${title} ${description}`, { kind: 'advisor_idea', k: 1 }).catch(() => [])
  if (semanticMatch[0] && semanticMatch[0].distance < SEMANTIC_DUPLICATE_THRESHOLD) {
    console.log(`[advisor] skipping likely semantic duplicate: "${title}" ~ "${semanticMatch[0].text.slice(0, 80)}" (distance ${semanticMatch[0].distance.toFixed(3)})`)
    return null
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const idea: ProjectIdea = {
    id,
    title,
    description,
    difficulty: raw.difficulty ?? 3,
    skills_learned: raw.skills_learned ?? [],
    estimated_hours: raw.estimated_hours ?? 5,
    starter_checklist: raw.starter_checklist ?? [],
    tech_stack: raw.tech_stack ?? [],
    created_at: now,
    refinement_log: [],
  }
  await db.execute({
    sql: `INSERT INTO project_ideas (id, title, description, difficulty, skills_learned, estimated_hours, starter_checklist, tech_stack, created_at, refinement_log, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [idea.id, idea.title, idea.description, idea.difficulty, JSON.stringify(idea.skills_learned), idea.estimated_hours, JSON.stringify(idea.starter_checklist), JSON.stringify(idea.tech_stack), idea.created_at, JSON.stringify(idea.refinement_log), source],
  })
  await rememberEntity({
    kind: 'advisor_idea',
    refId: idea.id,
    text: `${idea.title}. ${idea.description}`,
    metadata: { source },
  }).catch(err => console.error('[advisor] rememberEntity failed:', err))
  return idea
}

export async function generateCustomProjectIdeas(userInput: string, context?: AdvisorContext): Promise<ProjectIdea[]> {
  const ctx = await gatherAdvisorContext(userInput)

  const contextLines = [
    context?.level ? `Experience level: ${context.level}.` : '',
    context?.hoursPerWeek ? `Available ~${context.hoursPerWeek} hours per week.` : '',
  ].filter(Boolean).join(' ')

  const systemText = `You are a senior developer mentor helping a self-taught AI developer find their next project. Your job is to take what the user describes — a topic, problem, or vague idea — and turn it into 3 concrete, achievable project ideas using today's best AI tools.

The developer knows basic Python and JavaScript and is comfortable with APIs. ${contextLines}

Rules:
- Never replace the user's stated intent — build on it and ground it in current AI tooling
- If they describe a problem, design projects that solve that exact problem
- Pick tools from the current AI landscape below when relevant
- When a trending repo, dataset, or model below fits naturally, ground the idea in that specific named resource (and its link) instead of a generic placeholder
- The context blocks below are more current and more trustworthy than your own training data on what's new in AI right now — treat them as the authoritative source for any SPECIFIC named tool, model, library, dataset, repo, paper, company, or named individual you put in tech_stack or description. Never invent a specific product name or organization, however standard or well-known, that isn't named there
- General techniques, architecture, and engineering approach are yours to judge — deciding how the named resources above fit together into a real project, what steps make sense, and how to scope it is exactly the reasoning you're here to contribute, not something that needs to trace back to a context block
- If the context doesn't support a strong idea for some angle, favor a simpler idea grounded in what is present over inventing a named resource to fill the gap
- Scope each project to 1-20 hours of solo work

Current trending AI developments:
${ctx.trending}

Recent research papers:
${ctx.papers}

Trending repos you could build on:
${ctx.repos}

Trending datasets you could build on:
${ctx.datasets}

Recently released models:
${ctx.models}

Currently recommended AI tools (adopt/trial):
${ctx.radar}

Entities (companies/researchers) associated with those tools:
${ctx.entities ?? 'No tracked entity associations for these tools yet.'}`

  const response = await anthropic.messages.create({
    model: MODEL, max_tokens: 2500,
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `The user described what they want to build or a problem they're facing:\n\n"${userInput}"\n\nBefore writing, privately pick 3 distinct angles for this batch — they could differ by AI technique, by which part of the stack each project emphasizes, by scope/ambition, or another axis you judge fits this description best. The angles must be clearly non-overlapping: no two of the 3 ideas should be mistakable for variations of the same project. Don't mention the angles in your output — just use them to ensure variety.\n\nSuggest exactly 3 project ideas, one per angle, directly tied to the description above. Return JSON array only — no markdown fences:\n[{"title":"...","description":"2-3 sentences","difficulty":1-5,"skills_learned":["..."],"estimated_hours":5,"tech_stack":["..."],"starter_checklist":["step 1","step 2","step 3","step 4"]}]` }],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : '[]'
  let ideas: any[] = []
  try { const m = content.match(/\[[\s\S]*\]/); if (m) ideas = JSON.parse(m[0]) } catch {}

  const persisted = await Promise.all(ideas.slice(0, 3).map(i => persistIdea(i, 'custom')))
  return persisted.filter((i): i is ProjectIdea => i !== null)
}

export interface TrendingAdvisorContext {
  ctx: AdvisorSourceContext
  existingTitles: string
}

// DB-touching half — kept separate from buildAndRunTrendingIdeas so the eval
// harness can snapshot a context once and replay it against the (DB-free)
// prompt-building logic without needing a live database.
export async function fetchTrendingAdvisorContext(): Promise<TrendingAdvisorContext> {
  const day30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [ctx, { rows: existingIdeas }] = await Promise.all([
    gatherAdvisorContext(),
    db.execute({ sql: `SELECT title FROM project_ideas WHERE created_at >= ? AND source = 'trending'`, args: [day30] }),
  ])

  const existingTitles = (existingIdeas as any[]).map(i => i.title).join(', ')
  return { ctx, existingTitles }
}

// Pure prompt-building + Claude call — no DB access, no persistence. Reused
// by generateProjectIdeas (live pipeline) and the eval harness (frozen context).
export async function buildAndRunTrendingIdeas(
  { ctx, existingTitles }: TrendingAdvisorContext,
  context?: AdvisorContext
): Promise<any[]> {
  const contextLines = [
    context?.level ? `Experience level: ${context.level}.` : '',
    context?.interests?.length ? `Interested in: ${context.interests.join(', ')}.` : '',
    context?.hoursPerWeek ? `Available ~${context.hoursPerWeek} hours per week — calibrate project scope accordingly.` : '',
  ].filter(Boolean).join(' ')

  const systemText = `You are a senior developer mentoring a self-taught developer learning AI/ML. ${contextLines} Suggest realistic, achievable projects that: (1) can be built solo in 1-20 hours, (2) use current AI tools from the list below, (3) teach real skills, (4) produce a tangible shareable output — an API, demo app, or CLI tool a developer can show. The developer knows basic Python and JavaScript and is comfortable with APIs. When a trending repo, dataset, or model below fits naturally, ground the idea in that specific named resource (and its link) instead of a generic placeholder. The context blocks below are more current and more trustworthy than your own training data on what's new in AI right now — treat them as the authoritative source for any SPECIFIC named tool, model, library, dataset, repo, paper, company, or named individual you put in tech_stack or description; never invent a specific product name or organization, however standard or well-known, that isn't named there. General technique, architecture, and engineering approach are yours to judge — deciding how the named resources fit together into a real project is exactly the reasoning you're here to contribute. If the context doesn't support a strong idea for some angle, favor a simpler idea grounded in what is present over inventing a named resource to fill the gap.

Recent research papers:
${ctx.papers}

Trending repos you could build on:
${ctx.repos}

Trending datasets you could build on:
${ctx.datasets}

Recently released models:
${ctx.models}

Currently recommended AI tools (adopt/trial):
${ctx.radar}

Entities (companies/researchers) associated with those tools:
${ctx.entities ?? 'No tracked entity associations for these tools yet.'}`

  const response = await anthropic.messages.create({
    model: MODEL, max_tokens: 2500,
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Based on these recent AI developments:\n${ctx.trending}\n\n${existingTitles ? `Avoid repeating: ${existingTitles}\n\n` : ''}Before writing, privately pick 3 distinct angles for this batch — they could differ by AI technique, by which part of the stack each project emphasizes, by scope/ambition, or another axis you judge fits these developments best. The angles must be clearly non-overlapping: no two of the 3 ideas should be mistakable for variations of the same project. Don't mention the angles in your output — just use them to ensure variety.\n\nSuggest exactly 3 project ideas, one per angle, as a JSON array (no markdown fences):\n[{"title": "...", "description": "2-3 sentences", "difficulty": 1-5, "skills_learned": ["skill1"], "estimated_hours": 5, "tech_stack": ["React", "Claude API"], "starter_checklist": ["step 1", "step 2", "step 3", "step 4"]}]` }],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : '[]'
  let ideas: any[] = []
  try { const m = content.match(/\[[\s\S]*\]/); if (m) ideas = JSON.parse(m[0]) } catch {}

  return ideas.slice(0, 3)
}

export async function generateProjectIdeas(context?: AdvisorContext): Promise<ProjectIdea[]> {
  const trendingContext = await fetchTrendingAdvisorContext()
  const ideas = await buildAndRunTrendingIdeas(trendingContext, context)
  const persisted = await Promise.all(ideas.map(i => persistIdea(i, 'trending')))
  return persisted.filter((i): i is ProjectIdea => i !== null)
}

// ── Refinement ────────────────────────────────────────────────────────────

// TODO(evan): replace this. Key call to make: how strictly should Claude scope
// changes to what the user actually asked for, vs. letting a request cascade
// into a broader rewrite? (e.g. "swap React for Vue" — does that touch only
// tech_stack, or also the checklist steps that reference React-specific setup?)
// Left as a minimal working placeholder so the feature isn't broken in the
// meantime — but the scoping behavior below is a guess, not a considered one.
//
// Grounded against models/radar (not the full 6-block advisor context) — a
// refinement request is a targeted single-field edit, not a fresh idea pass,
// so it only needs enough of the current AI landscape to stop Claude from
// substituting a tool/model from training knowledge that isn't one you're
// actually tracking.
function buildRefineSystemPrompt(models: string, radar: string): string {
  return `You are adjusting an existing AI project idea based on a user's follow-up request. Apply the change the user asked for, and only that change — don't rewrite fields they didn't mention unless the change clearly requires it elsewhere too. Keep the same JSON shape as the input idea.

If the request calls for a different SPECIFIC named tool, model, or resource, only substitute one from the current AI landscape below (more current and more trustworthy than your own training data) — never invent a specific product name that isn't listed there. If nothing below fits, say so in your reply instead of inventing one. General technique and architecture decisions are yours to judge as normal.

Recently released models:
${models}

Currently recommended AI tools (adopt/trial):
${radar}`
}

export async function refineProjectIdea(ideaId: string, userMessage: string): Promise<ProjectIdea> {
  const [{ rows }, ctx] = await Promise.all([
    db.execute({ sql: `SELECT * FROM project_ideas WHERE id = ?`, args: [ideaId] }),
    gatherAdvisorContext(),
  ])
  const row = (rows as any[])[0]
  if (!row) throw new Error('Idea not found')

  const current: ProjectIdea = {
    id: row.id,
    title: row.title,
    description: row.description,
    difficulty: row.difficulty,
    skills_learned: safeJSON(row.skills_learned ?? '[]', []),
    estimated_hours: row.estimated_hours,
    starter_checklist: safeJSON(row.starter_checklist ?? '[]', []),
    tech_stack: safeJSON(row.tech_stack ?? '[]', []),
    created_at: row.created_at,
    refinement_log: safeJSON(row.refinement_log ?? '[]', []),
  }
  const log = current.refinement_log ?? []
  // Only the last few exchanges go to the model — the "current idea" JSON above
  // already encodes the cumulative effect of every prior edit, so the model
  // doesn't need the full transcript to make a sensible next edit, just enough
  // for conversational continuity. Caps cost/latency from growing unbounded on
  // a long-lived thread. Full log is still stored and shown in the UI.
  const RECENT_LOG_LIMIT = 6 // 3 user/assistant exchanges
  const recentLog = log.slice(-RECENT_LOG_LIMIT)
  const historyText = recentLog.map(m => `${m.role === 'user' ? 'User' : 'You'}: ${m.content}`).join('\n')

  const response = await anthropic.messages.create({
    model: MODEL, max_tokens: 2000,
    system: [{ type: 'text', text: buildRefineSystemPrompt(ctx.models, ctx.radar), cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `Current idea:\n${JSON.stringify({ title: current.title, description: current.description, difficulty: current.difficulty, skills_learned: current.skills_learned, estimated_hours: current.estimated_hours, starter_checklist: current.starter_checklist, tech_stack: current.tech_stack }, null, 2)}\n\n${historyText ? `Conversation so far:\n${historyText}\n\n` : ''}User's new request:\n"${userMessage}"\n\nReturn JSON only (no markdown fences):\n{"idea": {"title": "...", "description": "...", "difficulty": 1-5, "skills_learned": ["..."], "estimated_hours": 5, "tech_stack": ["..."], "starter_checklist": ["..."]}, "reply": "one short sentence confirming what changed"}`,
    }],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : '{}'
  let parsed: { idea?: any; reply?: string } = {}
  try { const m = content.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]) } catch {}

  const updatedIdea = parsed.idea ?? {}
  const reply = parsed.reply ?? 'Updated.'
  const now = new Date().toISOString()
  const newLog: IdeaRefinementMessage[] = [
    ...log,
    { role: 'user', content: userMessage, at: now },
    { role: 'assistant', content: reply, at: now },
  ]

  const result: ProjectIdea = {
    id: current.id,
    title: updatedIdea.title ?? current.title,
    description: updatedIdea.description ?? current.description,
    difficulty: updatedIdea.difficulty ?? current.difficulty,
    skills_learned: updatedIdea.skills_learned ?? current.skills_learned,
    estimated_hours: updatedIdea.estimated_hours ?? current.estimated_hours,
    starter_checklist: updatedIdea.starter_checklist ?? current.starter_checklist,
    tech_stack: updatedIdea.tech_stack ?? current.tech_stack,
    created_at: current.created_at,
    refinement_log: newLog,
  }

  await db.execute({
    sql: `UPDATE project_ideas SET title = ?, description = ?, difficulty = ?, skills_learned = ?, estimated_hours = ?, starter_checklist = ?, tech_stack = ?, refinement_log = ? WHERE id = ?`,
    args: [result.title, result.description, result.difficulty, JSON.stringify(result.skills_learned), result.estimated_hours, JSON.stringify(result.starter_checklist), JSON.stringify(result.tech_stack), JSON.stringify(result.refinement_log), result.id],
  })

  return result
}
