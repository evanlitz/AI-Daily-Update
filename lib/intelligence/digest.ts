import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL } from '../claude'
import { recall, remember, recallFeedItems } from '../memory'
import type { WeeklyDigest, DigestChange } from '../types'
import { getMondayISO } from '../utils'

// Extract meaningful words from a title for overlap comparison
function titleTokens(title: string): Set<string> {
  const STOPWORDS = new Set(['a','an','the','of','in','on','for','to','with','and','or','is','are','how','what','why','new','using','via','from','by'])
  return new Set(
    title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOPWORDS.has(w))
  )
}

// Group items that share 2+ significant title words — same story, multiple sources
function clusterItems(items: any[]): Array<{ representative: any; sources: string[]; count: number }> {
  const assigned = new Set<number>()
  const clusters: Array<{ representative: any; sources: string[]; count: number }> = []

  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue
    const tokensI = titleTokens(items[i].title)
    const cluster = { representative: items[i], sources: [items[i].source], count: 1 }
    assigned.add(i)

    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue
      const tokensJ = titleTokens(items[j].title)
      const overlap = [...tokensI].filter(t => tokensJ.has(t)).length
      if (overlap >= 2) {
        cluster.sources.push(items[j].source)
        cluster.count++
        assigned.add(j)
      }
    }

    clusters.push(cluster)
  }

  return clusters
}

function recencyBoost(publishedAt: string | null): number {
  if (!publishedAt) return 0
  const ageHours = (Date.now() - new Date(publishedAt).getTime()) / 3600000
  if (ageHours < 24) return 1.5
  if (ageHours < 48) return 0.8
  if (ageHours < 96) return 0.3
  return 0
}

async function getStoryContext(): Promise<string> {
  try {
    const { rows: threads } = await db.execute(
      `SELECT st.id, st.title, st.current_summary, st.watch_for,
              se.update_text, se.week, se.significance
       FROM story_threads st
       LEFT JOIN story_events se ON se.thread_id = st.id
         AND se.created_at = (SELECT MAX(created_at) FROM story_events WHERE thread_id = st.id)
       WHERE st.status = 'active'
       ORDER BY st.last_updated DESC
       LIMIT 12`
    )
    if (!(threads as any[]).length) return ''
    const lines = (threads as any[]).map(t =>
      `- **${t.title}**: ${t.current_summary ?? ''}${t.update_text ? ` | Latest: ${t.update_text}` : ''} | Watch for: ${t.watch_for ?? '?'}`
    )
    return `\n\nOngoing story threads you've been tracking:\n${lines.join('\n')}`
  } catch { return '' }
}

async function getAffinityContext(): Promise<string> {
  try {
    const { rows } = await db.execute(
      `SELECT category, source, read_count FROM user_affinity ORDER BY read_count DESC LIMIT 3`
    )
    if (!(rows as any[]).length) return ''
    const pairs = (rows as any[]).map((r: any) => `${r.category}/${r.source} (read ${r.read_count}×)`)
    return `\n\nUser's top engagement areas: ${pairs.join(', ')}. Prioritize these categories in highlights where relevant.`
  } catch { return '' }
}

async function getPriorDigests(currentWeekStart: string): Promise<{ week_start: string; highlights: string[] }[]> {
  try {
    const { rows } = await db.execute({
      sql: `SELECT week_start, highlights FROM weekly_digest WHERE week_start < ? ORDER BY week_start DESC LIMIT 3`,
      args: [currentWeekStart],
    })
    return (rows as any[]).map(row => ({
      week_start: row.week_start,
      highlights: JSON.parse(row.highlights ?? '[]'),
    }))
  } catch { return [] }
}

// One query per digest section — each retrieves items semantically relevant to
// that section's topic rather than pulling a flat date-sorted pool and hoping
// Claude distributes them correctly. The union is deduplicated before fetching
// full rows, so Claude still sees a coherent set, not four separate buckets.
const SECTION_QUERIES = [
  'major AI model releases company announcements capability breakthroughs',
  'AI developer tools frameworks libraries SDKs open source projects',
  'AI research papers machine learning academic findings benchmarks',
  'AI industry implications practical applications developer skills career',
]

async function getSemanticItems(sinceISO: string): Promise<any[]> {
  const results = await Promise.all(
    SECTION_QUERIES.map(q => recallFeedItems(q, 25, { sinceISO }))
  )

  // Deduplicate: if an item appears in multiple section results keep the
  // closest (lowest) distance so the re-ranking in buildAndRunDigest has
  // the most accurate signal for each item.
  const bestDistance = new Map<string, number>()
  const orderedIds: string[] = []
  for (const section of results) {
    for (const item of section) {
      const prev = bestDistance.get(item.id)
      if (prev === undefined || item.distance < prev) bestDistance.set(item.id, item.distance)
      if (prev === undefined) orderedIds.push(item.id)
    }
  }

  if (!orderedIds.length) return []

  const placeholders = orderedIds.map(() => '?').join(', ')
  const { rows } = await db.execute({
    sql: `SELECT id, source, title, raw_content, summary, published_at, velocity_score, topic_tags
          FROM feed_items WHERE id IN (${placeholders})`,
    args: orderedIds,
  })
  return rows as any[]
}

export interface DigestContext {
  raw: any[]
  storyContext: string
  priorDigests: { week_start: string; highlights: string[] }[]
  affinityContext: string
}

// DB-touching half of digest generation — kept separate from buildAndRunDigest
// so the eval harness can snapshot a context once and replay it against the
// (DB-free) prompt-building logic without needing a live database.
export async function fetchDigestContext(weekStart: string): Promise<DigestContext> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [semanticItems, storyContext, priorDigests, affinityContext] = await Promise.all([
    getSemanticItems(weekAgo),
    getStoryContext(),
    getPriorDigests(weekStart),
    getAffinityContext(),
  ])

  // Fall back to date-sorted SQL if semantic retrieval came back empty (Voyage
  // outage, embeddings not yet computed on a fresh DB, etc.)
  let raw: any[] = semanticItems
  if (raw.length < 15) {
    console.warn('[digest] semantic retrieval yielded < 15 items — falling back to SQL')
    const { rows } = await db.execute({
      sql: `SELECT id, source, title, raw_content, summary, published_at, velocity_score, topic_tags FROM feed_items WHERE fetched_at >= ? AND screened = 1 ORDER BY fetched_at DESC LIMIT 200`,
      args: [weekAgo],
    })
    raw = rows as any[]
  }

  return { raw, storyContext, priorDigests, affinityContext }
}

// Pure prompt-building + Claude call — no DB access. Reused by both the live
// pipeline (generateWeeklyDigest) and the eval harness (replaying a frozen
// DigestContext fixture).
export async function buildAndRunDigest(
  { raw, storyContext, priorDigests, affinityContext }: DigestContext,
  weekStart: string
): Promise<{ content: string; highlights: string[]; changes: DigestChange[]; sourceMaterial: string }> {
  // Source diversity cap: max 8 per source
  const sourceCounts: Record<string, number> = {}
  const diverse = raw.filter(item => {
    const src = item.source
    sourceCounts[src] = (sourceCounts[src] ?? 0) + 1
    return sourceCounts[src] <= 8
  })

  // Score each item: velocity + recency boost
  const scored = diverse.map(item => ({
    ...item,
    effectiveScore: (item.velocity_score ?? 0) + recencyBoost(item.published_at),
  })).sort((a, b) => b.effectiveScore - a.effectiveScore)

  // Cluster into stories, sort clusters by max effective score * sqrt(count) (multi-source = more important)
  const clusters = clusterItems(scored.slice(0, 80))
  clusters.sort((a, b) => {
    const scoreA = (a.representative.effectiveScore ?? 0) * Math.sqrt(a.count)
    const scoreB = (b.representative.effectiveScore ?? 0) * Math.sqrt(b.count)
    return scoreB - scoreA
  })

  // Take top 25 clusters, format for Claude
  const top = clusters.slice(0, 25)
  const itemList = top.map((cluster, i) => {
    const item = cluster.representative
    const content = (item.raw_content ?? item.summary ?? '').slice(0, 400)
    const sourceNote = cluster.count > 1
      ? ` [covered by ${cluster.count} sources: ${cluster.sources.map(s => s.replace('rss:', '')).join(', ')}]`
      : ` [${item.source.replace('rss:', '')}]`
    return `${i + 1}.${sourceNote}\n   Title: ${item.title}\n   ${content}`
  }).join('\n\n')

  // Build trajectory context from up to 3 prior weeks — oldest first so Claude reads the arc in order
  const hasPrior = priorDigests.length > 0
  const trajectoryContext = hasPrior
    ? `\n\nPRIOR WEEKS (oldest → newest — use to write The Trajectory and identify changes):\n` +
      [...priorDigests].reverse().map(d =>
        `Week of ${d.week_start}:\n${d.highlights.map(h => `- ${h}`).join('\n')}`
      ).join('\n\n')
    : ''

  // Semantic recall: find past highlights related to THIS week's actual topics,
  // regardless of how many weeks ago they ran — getPriorDigests() above only
  // looks back 3 calendar weeks, so a relevant callout from 2 months ago
  // (e.g. the same model family resurfacing) would otherwise be invisible.
  const recalledHighlights = await recall(top.slice(0, 5).map(c => c.representative.title).join('; '), {
    kind: 'digest_highlight',
    k: 5,
  }).catch(() => [])
  const relatedPastCoverage = recalledHighlights.length
    ? `\n\nRELATED PAST COVERAGE (semantically related, may be older than 3 weeks — reference only if it adds real continuity, don't force it):\n` +
      recalledHighlights.map(r => `- (week of ${r.metadata.week_start ?? '?'}) ${r.text}`).join('\n')
    : ''

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3800,
    system: [
      {
        type: 'text',
        text: `You are an expert AI analyst writing a weekly briefing for a self-taught developer who wants to stay current with AI. Be direct, opinionated, and practical. No hype. Format your response in markdown.

When an item is marked "covered by N sources", treat it as proportionally more significant — multiple outlets covering the same story is a strong signal of importance. Prioritize those stories.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Here are this week's top AI developments (ranked by recency + momentum, multi-source stories flagged):\n\n${itemList}${storyContext}${affinityContext}${trajectoryContext}${relatedPastCoverage}\n\nWrite a weekly digest with these exact sections in this order:\n\n## The Trajectory\n${hasPrior
  ? `Open with where AI actually is right now in its development arc. Use the prior weeks' highlights above to establish context, then situate this week as a chapter in that story. Be willing to make a real call — "We're in the late innings of X", "This week marks an inflection in Y", "The gap between labs is closing because Z." This is analysis, not summary: what does this week MEAN given where we've been? 2-3 focused paragraphs. This section appears first because it frames everything that follows.`
  : `A high-level orientation on where AI stands right now and what direction it's heading. 2 paragraphs. Make a real call about the current phase of AI development.`
}\n\n## The Big Moves\n2-3 most important model/company developments. Lead with multi-source stories. Reference ongoing story threads where relevant.${hasPrior ? ' Note if anything from a prior week escalated or resolved.' : ''}\n\n## Tools Worth Your Time\nNew dev tools or frameworks worth trying. Be specific about what they do and why a developer should care.\n\n## Research That Matters\n3 papers explained in plain English. What can developers actually do with each?\n\n## Hot Takes\nExactly 5 surprising, contrarian, or uncomfortable observations from this week. Not the headline — the implication most people are missing, the bold call that challenges consensus, or the thing the hype cycle is getting wrong.\n\n## What This Means For You\n3-4 concrete, actionable takeaways. Each must name a specific tool, decision, or experiment: "Try X this week by doing Y" — not "explore the space of Z". No generic advice.\n\nEnd with this exact JSON block on its own line:\n{"highlights":["sentence","sentence","sentence"],"changes":[{"type":"escalated","text":"something from a prior week that got bigger"},{"type":"resolved","text":"something that concluded"},{"type":"new","text":"something with no prior coverage"}]}${hasPrior ? '\nOnly include changes entries that are genuinely meaningful.' : '\nOmit the changes array — no prior weeks to compare against.'}`,
      },
    ],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : ''

  let highlights: string[] = []
  let changes: DigestChange[] = []
  try {
    // Match the last JSON object in the response (the trailing metadata block).
    // Claude sometimes wraps it in a ```json fence despite the prompt not asking
    // for one — tolerate an optional trailing fence before the end of string.
    const match = content.match(/(\{"highlights":[\s\S]*?\})(?:\s*```)?\s*$/)
    if (match) {
      const parsed = JSON.parse(match[1])
      highlights = parsed.highlights ?? []
      changes    = parsed.changes    ?? []
    }
  } catch { highlights = [] }

  // Everything the digest was actually grounded in — itemList (this week's
  // items) plus storyContext and trajectoryContext (prior weeks). Narrowing
  // this to itemList alone made the groundedness judge flag legitimate
  // cross-week references (e.g. in "The Trajectory") as fabricated.
  const sourceMaterial = `${itemList}${storyContext}${trajectoryContext}${relatedPastCoverage}`

  return { content, highlights, changes, sourceMaterial }
}

export async function generateWeeklyDigest(): Promise<WeeklyDigest> {
  const weekStart = getMondayISO()
  const context = await fetchDigestContext(weekStart)
  const { content, highlights, changes } = await buildAndRunDigest(context, weekStart)

  const id  = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.execute({
    sql: `INSERT OR REPLACE INTO weekly_digest (id, week_start, content_md, highlights, changes, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, weekStart, content, JSON.stringify(highlights), JSON.stringify(changes), now],
  })

  // Store this week's highlights as memories so future digests can recall()
  // them by topic, not just by "last 3 calendar weeks".
  await Promise.all(
    highlights.map(h => remember({ kind: 'digest_highlight', refId: id, text: h, metadata: { week_start: weekStart } }))
  ).catch(err => console.error('[digest] remember() failed:', err))

  return { id, week_start: weekStart, content_md: content, highlights, changes, created_at: now }
}
