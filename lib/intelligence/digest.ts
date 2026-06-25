import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL } from '../claude'
import { recall, remember, embed, recallFeedItems } from '../memory'
import type { RecallResult } from '../memory'
import type { WeeklyDigest, DigestChange } from '../types'
import { getMondayISO, sanitizeText } from '../utils'

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

// One query per digest section, aligned to each section's actual focus.
// Items are deduplicated globally: each item is assigned to whichever section
// it matched most closely (lowest cosine distance), so every section gets
// its own semantically relevant candidate pool rather than all sections
// competing for the same ranked list.
const SECTION_QUERIES: Record<string, string> = {
  trajectory: 'AI industry direction phase inflection milestone trend development arc narrative',
  bigMoves:   'AI model release company announcement capability breakthrough funding acquisition',
  tools:      'developer tool framework SDK library open source release API integration CLI',
  research:   'research paper arxiv preprint academic machine learning benchmark experiment finding',
  hotTakes:   'AI controversy criticism safety ethics debate hype backlash surprising contrarian',
  actionable: 'developer career workflow automation skill productivity practical tutorial how-to',
}

const SECTION_LABELS: Record<string, string> = {
  trajectory: 'THE TRAJECTORY',
  bigMoves:   'THE BIG MOVES',
  tools:      'TOOLS WORTH YOUR TIME',
  research:   'RESEARCH THAT MATTERS',
  hotTakes:   'HOT TAKES',
  actionable: 'WHAT THIS MEANS FOR YOU',
}

// Maps the markdown section heading Claude writes back to its section key,
// so we can store each section's output as a typed memory.
const SECTION_TITLE_MAP: Record<string, string> = {
  'The Trajectory':          'trajectory',
  'The Big Moves':           'bigMoves',
  'Tools Worth Your Time':   'tools',
  'Research That Matters':   'research',
  'Hot Takes':               'hotTakes',
  'What This Means For You': 'actionable',
}

async function getSemanticItems(
  sinceISO: string
): Promise<{ items: any[]; sectionMap: Record<string, string> }> {
  const entries = Object.entries(SECTION_QUERIES)

  const queryResults = await Promise.all(
    entries.map(async ([section, q]) => ({
      section,
      results: await recallFeedItems(q, 20, { sinceISO }),
    }))
  )

  // Assign each item to the section where cosine distance is lowest.
  const bestMatch = new Map<string, { section: string; distance: number }>()
  for (const { section, results } of queryResults) {
    for (const item of results) {
      const prev = bestMatch.get(item.id)
      if (!prev || item.distance < prev.distance) {
        bestMatch.set(item.id, { section, distance: item.distance })
      }
    }
  }

  const allIds = [...bestMatch.keys()]
  if (!allIds.length) return { items: [], sectionMap: {} }

  const placeholders = allIds.map(() => '?').join(', ')
  const { rows } = await db.execute({
    sql: `SELECT id, source, title, raw_content, summary, published_at, velocity_score, topic_tags
          FROM feed_items WHERE id IN (${placeholders})`,
    args: allIds,
  })

  const sectionMap = Object.fromEntries(allIds.map(id => [id, bestMatch.get(id)!.section]))
  return { items: rows as any[], sectionMap }
}

export interface DigestContext {
  raw: any[]
  sectionMap: Record<string, string>
  sectionPastCoverage: Record<string, RecallResult[]>
  storyContext: string
  priorDigests: { week_start: string; highlights: string[] }[]
  affinityContext: string
}

// DB-touching half of digest generation — kept separate from buildAndRunDigest
// so the eval harness can snapshot a context once and replay it against the
// (DB-free) prompt-building logic without needing a live database.
export async function fetchDigestContext(weekStart: string): Promise<DigestContext> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [{ items: semanticItems, sectionMap }, storyContext, priorDigests, affinityContext, sectionPastCoverageEntries] = await Promise.all([
    getSemanticItems(weekAgo),
    getStoryContext(),
    getPriorDigests(weekStart),
    getAffinityContext(),
    // Per-section recall runs in parallel with other DB calls. Uses each
    // section's query string as the recall probe — keeps fetchDigestContext
    // fully self-contained and leaves buildAndRunDigest as a pure function.
    Promise.all(
      Object.keys(SECTION_QUERIES).map(async key => {
        const sectionHits = await recall(SECTION_QUERIES[key], { kind: `digest_section_${key}`, k: 2 }).catch(() => [])
        const hits = sectionHits.length
          ? sectionHits
          : await recall(SECTION_QUERIES[key], { kind: 'digest_highlight', k: 3 }).catch(() => [])
        return [key, hits] as const
      })
    ),
  ])

  const sectionPastCoverage: Record<string, RecallResult[]> = Object.fromEntries(sectionPastCoverageEntries)

  // Fall back to date-sorted SQL if semantic retrieval came back empty (Voyage
  // outage, embeddings not yet computed on a fresh DB, etc.)
  let raw: any[] = semanticItems
  let resolvedSectionMap = sectionMap
  if (raw.length < 15) {
    console.warn('[digest] semantic retrieval yielded < 15 items — falling back to SQL')
    const { rows } = await db.execute({
      sql: `SELECT id, source, title, raw_content, summary, published_at, velocity_score, topic_tags FROM feed_items WHERE fetched_at >= ? AND screened = 1 ORDER BY fetched_at DESC LIMIT 200`,
      args: [weekAgo],
    })
    raw = rows as any[]
    resolvedSectionMap = {}
  }

  return { raw, sectionMap: resolvedSectionMap, sectionPastCoverage, storyContext, priorDigests, affinityContext }
}

// Pure prompt-building + Claude call — no DB access. Reused by both the live
// pipeline (generateWeeklyDigest) and the eval harness (replaying a frozen
// DigestContext fixture).
export async function buildAndRunDigest(
  { raw, sectionMap, sectionPastCoverage, storyContext, priorDigests, affinityContext }: DigestContext,
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

  // Group clusters by their assigned section, then format with section headers
  // so Claude knows which candidate pool belongs to which section of the digest.
  const top = clusters.slice(0, 30)

  const sectionBuckets: Record<string, typeof top> = {}
  for (const key of Object.keys(SECTION_QUERIES)) sectionBuckets[key] = []

  for (const cluster of top) {
    const section = sectionMap[cluster.representative.id] ?? 'bigMoves'
    sectionBuckets[section].push(cluster)
  }

  let globalIdx = 0
  const itemList = Object.entries(SECTION_LABELS).map(([key, label]) => {
    const bucket = sectionBuckets[key]
    if (!bucket.length) return ''
    const lines = bucket.map(cluster => {
      const item = cluster.representative
      const content = (item.raw_content ?? item.summary ?? '').slice(0, 400)
      const sourceNote = cluster.count > 1
        ? ` [covered by ${cluster.count} sources: ${cluster.sources.map((s: string) => s.replace('rss:', '')).join(', ')}]`
        : ` [${item.source.replace('rss:', '')}]`
      return `${++globalIdx}.${sourceNote}\n   Title: ${item.title}\n   ${content}`
    }).join('\n\n')
    return `--- ${label} ---\n${lines}`
  }).filter(Boolean).join('\n\n')

  // Build trajectory context from up to 3 prior weeks — oldest first so Claude reads the arc in order
  const hasPrior = priorDigests.length > 0
  const trajectoryContext = hasPrior
    ? `\n\nPRIOR WEEKS (oldest → newest — use to write The Trajectory and identify changes):\n` +
      [...priorDigests].reverse().map(d =>
        `Week of ${d.week_start}:\n${d.highlights.map(h => `- ${h}`).join('\n')}`
      ).join('\n\n')
    : ''

  const relatedPastCoverage = Object.values(sectionPastCoverage).some(hits => hits.length)
    ? `\n\nRELATED PAST COVERAGE BY SECTION (reference only if it adds real continuity — don't force it):\n` +
      Object.entries(sectionPastCoverage)
        .filter(([, hits]) => hits.length)
        .map(([key, hits]) =>
          `${SECTION_LABELS[key]}:\n` +
          hits.map(h => `- (week of ${h.metadata.week_start ?? '?'}) ${h.text}`).join('\n')
        )
        .join('\n\n')
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

  // Store highlights as short-form memories for backward-compat recall.
  await Promise.all(
    highlights.map(h => remember({ kind: 'digest_highlight', refId: id, text: h, metadata: { week_start: weekStart } }))
  ).catch(err => console.error('[digest] remember() failed:', err))

  // Parse sections from the Claude response and store each as a memory.
  // Batch all texts into one Voyage embed call instead of one call per section.
  const sectionEntries = content
    .replace(/\{["']?highlights[\s\S]*$/, '')
    .split(/^(?=## )/m)
    .filter(p => p.trim())
    .flatMap(part => {
      const title = part.match(/^## (.+)/)?.[1]?.trim() ?? ''
      const key = SECTION_TITLE_MAP[title]
      if (!key) return []
      const text = sanitizeText(part.trim())
      return text ? [{ key, text }] : []
    })

  if (sectionEntries.length) {
    const vectors = await embed(sectionEntries.map(s => s.text), 'document').catch(() => [])
    await db.batch([
      ...sectionEntries.map(({ key }) => ({
        sql: `DELETE FROM memories WHERE kind = ? AND ref_id = ?`,
        args: [`digest_section_${key}`, weekStart],
      })),
      ...sectionEntries
        .map(({ key, text }, i) => ({ key, text, vec: vectors[i] }))
        .filter(({ vec }) => vec?.length)
        .map(({ key, text, vec }) => ({
          sql: `INSERT INTO memories (id, kind, ref_id, text, metadata, embedding, created_at) VALUES (?, ?, ?, ?, ?, vector32(?), ?)`,
          args: [crypto.randomUUID(), `digest_section_${key}`, weekStart, text, JSON.stringify({ week_start: weekStart }), JSON.stringify(vec), now],
        })),
    ] as any[]).catch(err => console.error('[digest] section memories failed:', err))
  }

  return { id, week_start: weekStart, content_md: content, highlights, changes, created_at: now }
}
