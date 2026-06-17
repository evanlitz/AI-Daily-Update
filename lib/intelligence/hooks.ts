import { anthropic, MODEL_FAST } from '../claude'
import db from '../db'
import type { FeedItem } from '../types'
import type { ExtractedEntity } from './entities'
import { safeJSON } from '../utils'

const SYSTEM_PROMPT = `You screen AI/ML news items for relevance, write hooks, and extract named entities and tools.

Relevance: mark relevant=true only if the item is meaningfully about AI, ML, LLMs, robotics, or adjacent developer tooling. Mark relevant=false for: job postings, general tech/finance/politics news, press releases for non-AI products, content unrelated to AI development.

Hook (only for relevant items): one sentence, max 100 chars, concrete practical relevance for a self-taught developer, no hype or hedging.
Good: "First open-weight model to beat GPT-4o on coding benchmarks"
Bad: "This is significant for the AI community"
Bad: "This could change everything for developers"
Bad: "Researchers have achieved a new milestone in AI"

Entities (all items, including irrelevant): up to 4 key named entities — companies, AI models, or researchers. Canonical form only: "GPT-4o" not "gpt 4o", "Anthropic" not "anthropic". Type must be "company", "model", "researcher", or "paper". Generic terms like "AI" or "LLM" are NOT entities. Omit entities array if none.

Tools (only for relevant items): up to 5 AI tool or model names explicitly mentioned — frameworks, libraries, models, techniques, or infra products a developer could actually use. Canonical form only: "LangGraph" not "langgraph", "vLLM" not "vllm", "GPT-4o" not "gpt4o". Generic terms ("AI", "LLM", "transformer", "neural network") are NOT tools. Omit tools array if none.`

export type ScreenResult = {
  items: FeedItem[]
  entityMap: Record<string, ExtractedEntity[]>
  toolNames: string[]
}

// Normalize a tool name for deduplication (same key as radar.ts normalizeKey)
function normalizeToolKey(s: string): string {
  return s.toLowerCase().replace(/[\s\-_.]+/g, '')
}

// Backfill hooks for any items already in the DB that slipped through without one.
export async function generateHooks(): Promise<void> {
  const { rows } = await db.execute({
    sql: `SELECT id, title, source, raw_content FROM feed_items WHERE hook IS NULL AND screened = 1 ORDER BY fetched_at DESC LIMIT 30`,
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
      model: MODEL_FAST,
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

    const parsed: { n: number; hook: string }[] = safeJSON(match[0], [])
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

// Screen all unscreened items from the DB (screened = 0).
// Deletes irrelevant items, marks relevant ones screened = 1, and sets their hook.
// Returns the kept items + entityMap + toolNames for downstream intel tasks.
export async function screenPendingItems(): Promise<ScreenResult> {
  const { rows } = await db.execute({
    sql: `SELECT id, source, title, url, summary, raw_content, velocity_score FROM feed_items WHERE screened = 0 ORDER BY fetched_at DESC LIMIT 200`,
    args: [],
  })

  if (!rows.length) return { items: [], entityMap: {}, toolNames: [] }

  const candidates = rows as any[]
  const BATCH = 30
  const keptRows: { item: any; hook?: string }[] = []
  const entityMap: Record<string, ExtractedEntity[]> = {}
  const toolsSeen = new Map<string, string>()
  const toDelete: string[] = []

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH)
    const prompt = batch.map((item, n) => {
      const snippet = item.raw_content ? `\n   ${String(item.raw_content).slice(0, 200)}` : ''
      return `${n + 1}. (${item.source}) ${item.title}${snippet}`
    }).join('\n')

    try {
      const resp = await anthropic.messages.create({
        model: MODEL_FAST,
        max_tokens: 2800,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: `Screen each item, write a hook for relevant ones, and extract entities and tools. Return ONLY a JSON array (one entry per item, in order):\n[{"n":1,"relevant":true,"hook":"...","entities":[{"name":"Anthropic","type":"company"}],"tools":["LangGraph","vLLM"]},{"n":2,"relevant":false,"entities":[]},...]` +
            `\n\n${prompt}`,
        }],
      })

      const text = resp.content[0].type === 'text' ? resp.content[0].text : ''
      const match = text.match(/\[[\s\S]*\]/)
      if (!match) {
        console.error('[hooks] no JSON in response')
        keptRows.push(...batch.map(item => ({ item })))
        continue
      }

      const parsed: { n: number; relevant: boolean; hook?: string; entities?: ExtractedEntity[]; tools?: string[] }[] = safeJSON(match[0], [])
      let kept = 0, dropped = 0
      for (const entry of parsed) {
        const item = batch[entry.n - 1]
        if (!item) continue
        if (Array.isArray(entry.entities) && entry.entities.length) {
          entityMap[item.id] = entry.entities.filter((e: ExtractedEntity) => e.name && e.type)
        }
        if (entry.relevant === false) { toDelete.push(item.id); dropped++; continue }
        if (Array.isArray(entry.tools)) {
          for (const t of entry.tools) {
            if (typeof t === 'string' && t.length > 1) {
              const key = normalizeToolKey(t)
              if (!toolsSeen.has(key)) toolsSeen.set(key, t)
            }
          }
        }
        keptRows.push({ item, hook: entry.hook ? entry.hook.slice(0, 120) : undefined })
        kept++
      }
      console.log(`[hooks] pending batch ${Math.floor(i / BATCH) + 1}: kept ${kept}, dropped ${dropped}`)
    } catch (err) {
      console.error('[hooks] screen error:', err)
      keptRows.push(...batch.map(item => ({ item })))
    }
  }

  // Delete irrelevant items
  if (toDelete.length > 0) {
    const CHUNK = 100
    for (let i = 0; i < toDelete.length; i += CHUNK) {
      const chunk = toDelete.slice(i, i + CHUNK)
      await db.execute({ sql: `DELETE FROM feed_items WHERE id IN (${chunk.map(() => '?').join(',')})`, args: chunk })
    }
    console.log(`[hooks] deleted ${toDelete.length} irrelevant items`)
  }

  // Mark relevant items screened = 1 and write their hooks
  if (keptRows.length > 0) {
    await db.batch(keptRows.map(({ item, hook }) => ({
      sql: `UPDATE feed_items SET screened = 1, hook = COALESCE(?, hook) WHERE id = ?`,
      args: [hook ?? null, item.id],
    })))
    console.log(`[hooks] marked ${keptRows.length} items screened`)
  }

  const items = keptRows.map(({ item }) => item as unknown as FeedItem)
  return { items, entityMap, toolNames: [...toolsSeen.values()] }
}
