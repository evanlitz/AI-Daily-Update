import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL } from '../claude'
import type { WeeklyDigest } from '../types'
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

async function getPreviousDigest(currentWeekStart: string): Promise<{ week_start: string; highlights: string[] } | null> {
  try {
    const { rows } = await db.execute({
      sql: `SELECT week_start, highlights FROM weekly_digest WHERE week_start < ? ORDER BY week_start DESC LIMIT 1`,
      args: [currentWeekStart],
    })
    const row = rows[0] as any
    if (!row) return null
    return { week_start: row.week_start, highlights: JSON.parse(row.highlights ?? '[]') }
  } catch { return null }
}

export async function generateWeeklyDigest(): Promise<WeeklyDigest> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const weekStart = getMondayISO()

  const [{ rows: raw }, storyContext, prevDigest, affinityContext] = await Promise.all([
    db.execute({
      sql: `SELECT id, source, title, raw_content, summary, published_at, velocity_score, topic_tags FROM feed_items WHERE fetched_at >= ? ORDER BY fetched_at DESC LIMIT 200`,
      args: [weekAgo],
    }),
    getStoryContext(),
    getPreviousDigest(weekStart),
    getAffinityContext(),
  ]) as [{ rows: any[] }, string, { week_start: string; highlights: string[] } | null, string]

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

  const prevContext = prevDigest
    ? `\n\nPREVIOUS WEEK (week of ${prevDigest.week_start}):\n${prevDigest.highlights.map(h => `- ${h}`).join('\n')}\n\nUse this to identify what escalated, what resolved, and what is genuinely new this week.`
    : ''

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2800,
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
        content: `Here are this week's top AI developments (ranked by recency + momentum, multi-source stories flagged):\n\n${itemList}${storyContext}${affinityContext}${prevContext}\n\nWrite a weekly digest with these sections:\n## The Big Moves\n2-3 most important model/company developments. If any story was covered by multiple sources, lead with those. Reference how ongoing story threads have progressed where relevant.${prevDigest ? ' Note if anything from last week escalated or resolved.' : ''}\n## Tools Worth Your Time\nNew dev tools or frameworks worth trying. Be specific about what they do and why a developer should care.\n## Research That Matters\n1-2 papers explained in plain English. What can developers actually do with this?\n## Hot Takes\n2-3 surprising, contrarian, or uncomfortable observations from this week. Not the headline — the implication most people are missing, the bold call that challenges consensus, or the thing the hype cycle is getting wrong.\n## What This Means For You\n3-4 concrete, actionable takeaways. Each must name a specific tool, decision, or experiment: "Try X this week by doing Y" — not "explore the space of Z". No generic advice.\n\nEnd with this exact JSON block on its own line:\n{"highlights":["sentence","sentence","sentence"],"changes":[{"type":"escalated","text":"something from last week that got bigger"},{"type":"resolved","text":"something that concluded"},{"type":"new","text":"something with no prior coverage"}]}${prevDigest ? '\nOnly include changes entries that are genuinely meaningful. Omit the changes array if there is no previous week to compare against.' : '\nOmit the changes array — no previous week to compare against.'}`,
      },
    ],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : ''

  let highlights: string[] = []
  let changes: { type: 'escalated' | 'resolved' | 'new'; text: string }[] = []
  try {
    // Match the last JSON object in the response (the trailing metadata block)
    const match = content.match(/(\{"highlights":[\s\S]*?\})(?:\s*)$/)
    if (match) {
      const parsed = JSON.parse(match[1])
      highlights = parsed.highlights ?? []
      changes    = parsed.changes    ?? []
    }
  } catch { highlights = [] }

  const id  = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.execute({
    sql: `INSERT OR REPLACE INTO weekly_digest (id, week_start, content_md, highlights, changes, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, weekStart, content, JSON.stringify(highlights), JSON.stringify(changes), now],
  })

  return { id, week_start: weekStart, content_md: content, highlights, changes, created_at: now }
}
