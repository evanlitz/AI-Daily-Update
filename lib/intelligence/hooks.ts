import { anthropic, MODEL } from '../claude'
import db from '../db'
import type { FeedItem } from '../types'
import type { ExtractedEntity } from './entities'
import { safeJSON } from '../utils'

const SYSTEM_PROMPT = `You screen AI/ML news items for relevance, write hooks, and extract named entities.

Relevance: mark relevant=true only if the item is meaningfully about AI, ML, LLMs, robotics, or adjacent developer tooling. Mark relevant=false for: job postings, general tech/finance/politics news, press releases for non-AI products, content unrelated to AI development.

Hook (only for relevant items): one sentence, max 100 chars, concrete practical relevance for a self-taught developer, no hype or hedging.
Good: "First open-weight model to beat GPT-4o on coding benchmarks"
Bad: "This is significant for the AI community"

Entities (all items, including irrelevant): up to 4 key named entities — companies, AI models, or researchers. Canonical form only: "GPT-4o" not "gpt 4o", "Anthropic" not "anthropic". Type must be "company", "model", "researcher", or "paper". Generic terms like "AI" or "LLM" are NOT entities. Omit entities array if none.`

export type ScreenResult = {
  items: FeedItem[]
  entityMap: Record<string, ExtractedEntity[]>
}

// Screen a batch of candidate items before DB insertion.
// Returns relevant items (with hooks) and an entity map for ALL items.
export async function screenAndHook(candidates: FeedItem[]): Promise<ScreenResult> {
  if (candidates.length === 0) return { items: [], entityMap: {} }

  const BATCH = 30
  const results: FeedItem[] = []
  const entityMap: Record<string, ExtractedEntity[]> = {}

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH)
    const prompt = batch.map((item, n) => {
      const snippet = item.raw_content ? `\n   ${String(item.raw_content).slice(0, 200)}` : ''
      return `${n + 1}. (${item.source}) ${item.title}${snippet}`
    }).join('\n')

    try {
      const resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2400,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: `Screen each item, write a hook for relevant ones, and extract entities for all. Return ONLY a JSON array (one entry per item, in order):\n[{"n":1,"relevant":true,"hook":"...","entities":[{"name":"Anthropic","type":"company"}]},{"n":2,"relevant":false,"entities":[]},...]\n\n${prompt}`,
        }],
      })

      const text = resp.content[0].type === 'text' ? resp.content[0].text : ''
      const match = text.match(/\[[\s\S]*\]/)
      if (!match) { console.error('[hooks] no JSON in response'); results.push(...batch); continue }

      const parsed: { n: number; relevant: boolean; hook?: string; entities?: ExtractedEntity[] }[] = safeJSON(match[0])
      let kept = 0, dropped = 0
      for (const entry of parsed) {
        const item = batch[entry.n - 1]
        if (!item) continue
        if (Array.isArray(entry.entities) && entry.entities.length) {
          entityMap[item.id] = entry.entities.filter(e => e.name && e.type)
        }
        if (entry.relevant === false) { dropped++; continue }
        results.push({ ...item, hook: entry.hook ? entry.hook.slice(0, 120) : item.hook })
        kept++
      }
      console.log(`[hooks] batch ${Math.floor(i / BATCH) + 1}: kept ${kept}, dropped ${dropped}`)
    } catch (err) {
      console.error('[hooks] screen error:', err)
      results.push(...batch)
    }
  }

  return { items: results, entityMap }
}

// Backfill hooks for any items already in the DB that slipped through without one.
export async function generateHooks(): Promise<void> {
  const { rows } = await db.execute({
    sql: `SELECT id, title, source, raw_content FROM feed_items WHERE hook IS NULL ORDER BY fetched_at DESC LIMIT 30`,
    args: [],
  })

  if (rows.length === 0) return

  const items = rows as any[]
  const prompt = items.map((item, n) => {
    const snippet = item.raw_content ? `\n   ${String(item.raw_content).slice(0, 200)}` : ''
    return `${n + 1}. (${item.source}) ${item.title}${snippet}`
  }).join('\n')

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Write a hook for each item (assume all are relevant). Return ONLY a JSON array: [{"n":1,"hook":"..."},...]\n\n${prompt}`,
      }],
    })

    const text = resp.content[0].type === 'text' ? resp.content[0].text : ''
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) { console.error('[hooks] no JSON in backfill response'); return }

    const parsed: { n: number; hook: string }[] = safeJSON(match[0])
    let updated = 0
    for (const { n, hook } of parsed) {
      const item = items[n - 1]
      if (!item || !hook) continue
      await db.execute({ sql: `UPDATE feed_items SET hook = ? WHERE id = ?`, args: [hook.slice(0, 120), item.id] })
      updated++
    }
    console.log(`[hooks] backfilled hooks for ${updated} items`)
  } catch (err) {
    console.error('[hooks] backfill error:', err)
  }
}
