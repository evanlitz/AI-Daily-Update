import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL } from '../claude'
import { safeJSON } from '../utils'

export interface DailyBrief {
  id: string
  date: string
  signal: string
  rising: string
  watch: string
  shift: string
  created_at: string
}

const SYSTEM_PROMPT = `You are the analytical intelligence layer of an AI tracking system. Your daily brief is read by developers and AI researchers who want signal — not summaries of everything, but what actually matters and what it means for the future of AI.

Write exactly 4 sections. Each section is 2-3 sentences maximum. Be direct and specific. No hedging ("it seems", "might", "possibly"). No filler ("it's worth noting", "importantly", "it's clear that").

Sections:
SIGNAL — The dominant development today drawn from incoming articles. What actually happened, stated plainly.
RISING — Which story threads are accelerating and what the pattern means. Connect the trajectory, not just the event.
WATCH — What to monitor in the next 7-14 days. Ground this in the predictions data and thread trajectories provided.
SHIFT — The development today most significant for the long-term trajectory of AI — for developers and the broader field. Not what happened. What it means for where AI is going.

CRITICAL: Only reference events, facts, and entities that appear explicitly in the data provided below. Do not introduce claims, statistics, or events not present in this data. If today's data is thin, say so directly rather than filling in from background knowledge.

Return ONLY valid JSON with this exact shape — no markdown, no explanation:
{"signal":"...","rising":"...","watch":"...","shift":"..."}`

export async function generateDailyBrief(): Promise<DailyBrief | null> {
  const today = new Date().toISOString().split('T')[0]

  // Idempotent — skip if already generated today
  const { rows: existing } = await db.execute({
    sql: `SELECT id FROM daily_briefs WHERE date = ?`,
    args: [today],
  })
  if (existing.length > 0) {
    console.log('[brief] already generated for today, skipping')
    return null
  }

  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString()
  const since7d  = new Date(Date.now() -  7 * 24 * 3600_000).toISOString()
  const nextYear = new Date().getFullYear() + 1

  const [itemsRes, risingRes, predsRes, nudgedRes] = await Promise.all([
    // Top new items from the last 24h with hooks
    db.execute({
      sql: `SELECT title, hook, source, velocity_score
            FROM feed_items
            WHERE fetched_at >= ? AND hook IS NOT NULL AND screened = 1
            ORDER BY velocity_score DESC LIMIT 15`,
      args: [since24h],
    }),
    // Actively rising story threads
    db.execute({
      sql: `SELECT st.title, st.category, st.acceleration_score,
                   (SELECT update_text FROM story_events
                    WHERE thread_id = st.id
                    ORDER BY created_at DESC LIMIT 1) AS latest_event
            FROM story_threads st
            WHERE st.status = 'active' AND st.acceleration_score >= 1.2
            ORDER BY st.acceleration_score DESC LIMIT 6`,
      args: [],
    }),
    // Imminent and near-future predictions
    db.execute({
      sql: `SELECT title, confidence, date_guess, category
            FROM ai_predictions
            WHERE status IN ('imminent','upcoming')
              AND year_guess <= ?
            ORDER BY year_guess ASC, month_guess ASC LIMIT 6`,
      args: [nextYear],
    }),
    // Predictions whose confidence was nudged in the last 7 days
    db.execute({
      sql: `SELECT title, confidence
            FROM ai_predictions
            WHERE updated_at >= ? AND status != 'past'
            ORDER BY updated_at DESC LIMIT 4`,
      args: [since7d],
    }),
  ])

  const items   = itemsRes.rows   as any[]
  const rising  = risingRes.rows  as any[]
  const preds   = predsRes.rows   as any[]
  const nudged  = nudgedRes.rows  as any[]

  if (items.length === 0 && rising.length === 0) {
    console.log('[brief] insufficient data to generate brief today')
    return null
  }

  // Build grounded context — everything Sonnet sees maps to a real DB row
  const itemBlock = items.length
    ? items.map(i => `- [${i.source.replace('rss:', '')}] ${i.title}${i.hook ? ` — ${i.hook}` : ''}`).join('\n')
    : '(no new items in last 24h)'

  const risingBlock = rising.length
    ? rising.map(r =>
        `- "${r.title}" (${r.category}, ×${Number(r.acceleration_score).toFixed(1)} acceleration)` +
        (r.latest_event ? `\n  Latest: ${String(r.latest_event).slice(0, 180)}` : '')
      ).join('\n')
    : '(no threads currently accelerating)'

  const predBlock = preds.length
    ? preds.map(p => `- "${p.title}" — ${p.confidence} confidence, est. ${p.date_guess ?? p.category}`).join('\n')
    : '(no imminent predictions)'

  const nudgedBlock = nudged.length
    ? nudged.map(n => `- "${n.title}" → now ${n.confidence}`).join('\n')
    : '(none)'

  const userMessage = `Today's date: ${today}

NEW ITEMS (last 24h, sorted by velocity):
${itemBlock}

RISING STORY THREADS (acceleration ≥ 1.2×):
${risingBlock}

IMMINENT PREDICTIONS (next 12 months):
${predBlock}

RECENTLY UPDATED PREDICTIONS:
${nudgedBlock}

Generate the daily brief now.`

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error('[brief] Claude returned no parseable JSON:', raw.slice(0, 200))
      return null
    }

    const parsed = safeJSON(match[0], {}) as { signal?: string; rising?: string; watch?: string; shift?: string }
    if (!parsed?.signal || !parsed?.rising || !parsed?.watch || !parsed?.shift) {
      console.error('[brief] incomplete JSON from Claude:', parsed)
      return null
    }

    const id  = crypto.randomUUID()
    const now = new Date().toISOString()

    await db.execute({
      sql: `INSERT OR IGNORE INTO daily_briefs (id, date, signal, rising, watch, shift, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, today, parsed.signal, parsed.rising, parsed.watch, parsed.shift, now],
    })

    console.log('[brief] generated for', today)
    return { id, date: today, ...parsed, created_at: now } as DailyBrief
  } catch (err) {
    console.error('[brief] generation failed:', err)
    return null
  }
}

export async function getLatestBrief(): Promise<DailyBrief | null> {
  const { rows } = await db.execute({
    sql: `SELECT * FROM daily_briefs ORDER BY date DESC LIMIT 1`,
    args: [],
  })
  return (rows[0] as unknown as DailyBrief) ?? null
}
