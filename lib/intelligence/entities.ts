import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL_FAST } from '../claude'
import type { FeedItem } from '../types'
import { safeJSON } from '../utils'
import { addEdge } from '../graph'

export interface ExtractedEntity {
  name: string
  type: 'company' | 'model' | 'researcher' | 'paper'
}

// Simple Levenshtein distance
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

export async function saveEntityMentions(
  items: FeedItem[],
  entityMap: Record<string, ExtractedEntity[]>
): Promise<void> {
  if (!items.length) return

  // Load all existing entities once for in-memory dedup
  const { rows: existingRows } = await db.execute(
    `SELECT id, name, aliases FROM entities`
  ) as { rows: any[] }

  // Build lookup: normalized form → entity id
  const nameToId = new Map<string, string>()
  for (const e of existingRows) {
    nameToId.set(e.name.toLowerCase().trim(), e.id)
    for (const alias of JSON.parse(e.aliases ?? '[]') as string[]) {
      nameToId.set(alias.toLowerCase().trim(), e.id)
    }
  }

  // Bucket existing keys by length so fuzzy match only scans plausible neighbors
  // (Levenshtein <= 2 means length can differ by at most 2) instead of the full table.
  const byLength = new Map<number, string[]>()
  for (const key of nameToId.keys()) {
    if (key.length < 5) continue
    const bucket = byLength.get(key.length) ?? []
    bucket.push(key)
    byLength.set(key.length, bucket)
  }

  const now = new Date().toISOString()
  let created = 0, linked = 0

  const aliasUpdates = new Map<string, string[]>() // entityId -> aliases array
  const newEntities: { id: string; name: string; type: string }[] = []
  const mentionInserts: { entityId: string; itemId: string }[] = []
  const mentionCounts = new Map<string, number>()

  for (const item of items) {
    const entities = entityMap[item.id] ?? []
    for (const { name, type } of entities) {
      const key = name.toLowerCase().trim()
      if (!key || key.length < 2) continue

      let entityId = nameToId.get(key)

      if (!entityId && key.length >= 5) {
        // Fuzzy-match only against existing keys of similar length (Levenshtein <= 2)
        for (let len = key.length - 2; len <= key.length + 2; len++) {
          const bucket = byLength.get(len)
          if (!bucket) continue
          for (const existingKey of bucket) {
            if (levenshtein(key, existingKey) <= 2) {
              entityId = nameToId.get(existingKey)
              break
            }
          }
          if (entityId) break
        }
        if (entityId) {
          const entity = existingRows.find(e => e.id === entityId)
          if (entity) {
            const aliases: string[] = aliasUpdates.get(entityId) ?? JSON.parse(entity.aliases ?? '[]')
            if (!aliases.includes(name)) {
              aliases.push(name)
              aliasUpdates.set(entityId, aliases)
            }
          }
          nameToId.set(key, entityId)
        }
      }

      if (!entityId) {
        entityId = crypto.randomUUID()
        newEntities.push({ id: entityId, name, type })
        nameToId.set(key, entityId)
        existingRows.push({ id: entityId, name, aliases: '[]' })
        const bucket = byLength.get(key.length) ?? []
        bucket.push(key)
        byLength.set(key.length, bucket)
        created++
      }

      mentionInserts.push({ entityId, itemId: item.id })
    }
  }

  if (newEntities.length > 0) {
    await db.batch(newEntities.map(e => ({
      sql: `INSERT OR IGNORE INTO entities (id, name, type, aliases, first_seen, mention_count) VALUES (?, ?, ?, '[]', ?, 0)`,
      args: [e.id, e.name, e.type, now],
    })))
  }

  if (aliasUpdates.size > 0) {
    await db.batch([...aliasUpdates.entries()].map(([id, aliases]) => ({
      sql: `UPDATE entities SET aliases = ? WHERE id = ?`,
      args: [JSON.stringify(aliases), id],
    })))
  }

  if (mentionInserts.length > 0) {
    const results = await db.batch(mentionInserts.map(({ entityId, itemId }) => ({
      sql: `INSERT OR IGNORE INTO entity_mentions (entity_id, source_type, source_id, created_at) VALUES (?, 'feed_item', ?, ?)`,
      args: [entityId, itemId, now],
    })))
    for (let i = 0; i < results.length; i++) {
      if (results[i].rowsAffected > 0) {
        const entityId = mentionInserts[i].entityId
        mentionCounts.set(entityId, (mentionCounts.get(entityId) ?? 0) + 1)
        linked++
      }
    }
  }

  if (mentionCounts.size > 0) {
    await db.batch([...mentionCounts.entries()].map(([id, count]) => ({
      sql: `UPDATE entities SET mention_count = mention_count + ? WHERE id = ?`,
      args: [count, id],
    })))
  }

  if (created + linked > 0) {
    console.log(`[entities] ${created} new entities, ${linked} mentions saved`)
  }
}

const EXTRACT_SYSTEM = `Extract named entities from AI news item titles and snippets.

Extract up to 4 entities per item. Valid types:
- "company": AI labs and tech companies (Anthropic, OpenAI, Google DeepMind, Meta, Mistral, DeepSeek, Cohere, xAI, Stability AI, Runway, etc.)
- "model": specific AI models (GPT-4o, Claude 3.5 Sonnet, Gemini 2.5 Pro, Llama 3, Grok 3, DeepSeek R1, Phi-3, etc.)
- "researcher": named individuals (Sam Altman, Dario Amodei, Yann LeCun, Geoffrey Hinton, etc.)
- "paper": short official paper name only

Rules:
- Canonical casing: "GPT-4o" not "gpt-4o", "Anthropic" not "ANTHROPIC"
- Generic terms are NOT entities: "AI", "LLM", "transformer", "neural network", "model", "paper"
- If nothing specific is named, return an empty entities array — do not fabricate`

// Same overrun risk as youtube_summaries.ts/radar.ts's per-task budgets — each
// batch is a sequential Claude call capped at 60s by claude.ts's client
// timeout. LIMIT 60 / BATCH 30 caps this at 2 batches today, so tripping this
// budget would mean the first batch alone ran long (API slowness, not volume),
// but it's cheap insurance and keeps this function consistent with its siblings.
const BACKFILL_TIME_BUDGET_MS = 60_000

// Processes feed items that have no entity mentions yet, up to 60 per pipeline run.
// Runs every pipeline cycle; naturally stops when all items are covered.
export async function backfillEntities(): Promise<void> {
  const { rows: feedRows } = await db.execute({
    sql: `SELECT fi.id, fi.title, fi.source, fi.raw_content
          FROM feed_items fi
          WHERE fi.screened = 1 AND NOT EXISTS (
            SELECT 1 FROM entity_mentions em
            WHERE em.source_id = fi.id AND em.source_type = 'feed_item'
          )
          ORDER BY fi.fetched_at DESC
          LIMIT 60`,
    args: [],
  }) as { rows: any[] }

  if (!feedRows.length) return

  const BATCH = 30
  const entityMap: Record<string, ExtractedEntity[]> = {}
  const loopStart = Date.now()
  let processed = 0

  for (let i = 0; i < feedRows.length; i += BATCH) {
    if (Date.now() - loopStart > BACKFILL_TIME_BUDGET_MS) {
      console.warn(`[entities] backfill time budget hit — ${feedRows.length - i} item(s) left for next run`)
      break
    }
    const batch = feedRows.slice(i, i + BATCH)
    processed += batch.length
    const prompt = batch.map((item: any, n: number) => {
      const snippet = item.raw_content ? `\n   ${String(item.raw_content).slice(0, 200)}` : ''
      return `${n + 1}. (${item.source}) ${item.title}${snippet}`
    }).join('\n')

    try {
      const resp = await anthropic.messages.create({
        model: MODEL_FAST,
        max_tokens: 1400,
        system: [{ type: 'text', text: EXTRACT_SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: `Extract entities from each item. Return ONLY a JSON array:\n[{"n":1,"entities":[{"name":"Anthropic","type":"company"},...]},...]\n\n${prompt}`,
        }],
      })

      const text = resp.content[0].type === 'text' ? resp.content[0].text : ''
      const match = text.match(/\[[\s\S]*\]/)
      if (!match) continue

      const parsed: { n: number; entities: ExtractedEntity[] }[] = safeJSON(match[0], [])
      for (const entry of parsed) {
        const item = batch[entry.n - 1]
        if (!item || !Array.isArray(entry.entities)) continue
        entityMap[item.id] = entry.entities.filter((e: any) => e.name && e.type)
      }
    } catch (err) {
      console.error('[entities] backfill batch error:', err)
    }
  }

  const items = feedRows.map((r: any) => ({ id: r.id, topic_tags: [] }) as unknown as FeedItem)
  await saveEntityMentions(items, entityMap)
  console.log(`[entities] backfilled ${processed} feed items`)
}

const MIN_CO_MENTIONS = 3
const CO_MENTION_WEIGHT_CAP = 10

// SQL-only co-occurrence — entities mentioned in the same feed_item at least
// MIN_CO_MENTIONS times. Deliberately not LLM-confirmed (unlike linkThreads()'s
// Jaccard+Claude-confirm pattern) — validate this free version is useful before
// spending a Claude budget on a semantic upgrade. em1.entity_id < em2.entity_id
// both dedupes each pair to a single row and gives it a canonical ordering, so
// only one direction is ever written; readers match symmetrically (see
// app/api/entities/[id]/route.ts), same pattern thread_relations already uses.
export async function linkCoMentionedEntities(): Promise<void> {
  const { rows } = await db.execute({
    sql: `SELECT em1.entity_id AS a, em2.entity_id AS b, COUNT(*) AS cnt
          FROM entity_mentions em1
          JOIN entity_mentions em2
            ON em1.source_type = em2.source_type
           AND em1.source_id   = em2.source_id
           AND em1.entity_id   < em2.entity_id
          WHERE em1.source_type = 'feed_item'
          GROUP BY em1.entity_id, em2.entity_id
          HAVING COUNT(*) >= ?`,
    args: [MIN_CO_MENTIONS],
  }) as { rows: any[] }

  if (!rows.length) return

  for (const row of rows) {
    const weight = Math.min(Number(row.cnt) / CO_MENTION_WEIGHT_CAP, 1)
    // Guarded so one bad write doesn't abort the loop and drop every remaining
    // pair for this cycle — same convention as predictions.ts's evidence_for write.
    await addEdge('entity', row.a as string, 'entity', row.b as string, 'co_mentioned', {
      weight,
      metadata: { count: Number(row.cnt) },
    }).catch(err => console.error('[entities] addEdge co_mentioned failed:', err))
  }
  console.log(`[entities] linkCoMentionedEntities: ${rows.length} entity pairs linked`)
}
