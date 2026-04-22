import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL } from '../claude'
import type { WeeklyDigest } from '../types'

function getMondayISO(): string {
  const now = new Date()
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString()
}

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

export async function generateWeeklyDigest(): Promise<WeeklyDigest> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { rows: raw } = await db.execute({
    sql: `SELECT id, source, title, raw_content, summary, published_at, velocity_score, topic_tags FROM feed_items WHERE fetched_at >= ? ORDER BY fetched_at DESC LIMIT 200`,
    args: [weekAgo],
  }) as { rows: any[] }

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

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2500,
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
        content: `Here are this week's top AI developments (ranked by recency + momentum, multi-source stories flagged):\n\n${itemList}\n\nWrite a weekly digest with these sections:\n## The Big Moves\n2-3 most important model/company developments. If any story was covered by multiple sources, lead with those.\n## Tools Worth Your Time\nNew dev tools or frameworks worth trying. Be specific about what they do and why a developer should care.\n## Research That Matters\n1-2 papers explained in plain English. What can developers actually do with this?\n## What This Means For You\n3-4 concrete, actionable takeaways for someone learning AI development. No generic advice.\n\nEnd with this exact JSON block on its own line:\n{"highlights": ["one short sentence", "one short sentence", "one short sentence"]}`,
      },
    ],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : ''

  let highlights: string[] = []
  try {
    const match = content.match(/\{"highlights":\s*\[[^\]]+\]/)
    if (match) highlights = JSON.parse(match[0] + '}').highlights ?? []
  } catch { highlights = [] }

  const weekStart = getMondayISO()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.execute({
    sql: `INSERT OR REPLACE INTO weekly_digest (id, week_start, content_md, highlights, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [id, weekStart, content, JSON.stringify(highlights), now],
  })

  return { id, week_start: weekStart, content_md: content, highlights, created_at: now }
}
