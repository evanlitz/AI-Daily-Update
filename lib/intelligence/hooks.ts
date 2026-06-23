import { anthropic, MODEL_FAST } from '../claude'
import db from '../db'
import type { FeedItem } from '../types'
import type { ExtractedEntity } from './entities'
import { safeJSON } from '../utils'
import { findRecentDuplicateFeedItem } from '../memory'

// Strict on purpose: a false-positive match here would copy the wrong
// relevance/hook onto a genuinely different story, vs. advisor.ts's looser
// 0.15 idea-dedup where a false positive just skips a redundant suggestion.
const DEDUP_DISTANCE_THRESHOLD = 0.08
const DEDUP_WINDOW_DAYS = 14
// github/github-releases legitimately produce near-identical titles for
// distinct updates (e.g. consecutive release versions) — never fast-track these.
const DEDUP_EXCLUDED_SOURCE_PREFIXES = ['github']
// Input tokens are cheap and prefill is parallelized, so a generous snippet costs
// almost nothing extra — but the old 200-char cap cut off mid-sentence for most
// sources and gutted transcripts (which open with intros/sponsor reads, not the thesis).
const SCREENING_SNIPPET_CHARS = 600
const MAX_SCREEN_ATTEMPTS = 3

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

async function recordClaudeUsage(task: string, inputTokens: number, outputTokens: number): Promise<void> {
  await db.execute({
    sql: `INSERT INTO claude_usage (run_at, task, input_tokens, output_tokens) VALUES (?, ?, ?, ?)`,
    args: [new Date().toISOString(), task, inputTokens, outputTokens],
  }).catch(err => console.error('[hooks] recordClaudeUsage failed:', err))
}

type SourceTally = { accepted: number; rejected: number; fastTracked: number }

async function recordScreeningStats(runAt: string, tallies: Map<string, SourceTally>): Promise<void> {
  if (!tallies.size) return
  await db.batch(
    Array.from(tallies.entries()).map(([source, t]) => ({
      sql: `INSERT INTO screening_stats (run_at, source, accepted_count, rejected_count, fast_tracked_count) VALUES (?, ?, ?, ?, ?)`,
      args: [runAt, source, t.accepted, t.rejected, t.fastTracked],
    }))
  ).catch(err => console.error('[hooks] recordScreeningStats failed:', err))
}

function bumpTally(tallies: Map<string, SourceTally>, source: string, field: keyof SourceTally): void {
  const t = tallies.get(source) ?? { accepted: 0, rejected: 0, fastTracked: 0 }
  t[field]++
  tallies.set(source, t)
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
    const snippet = item.raw_content ? `\n   ${String(item.raw_content).slice(0, SCREENING_SNIPPET_CHARS)}` : ''
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

    await recordClaudeUsage('generate_hooks', resp.usage.input_tokens, resp.usage.output_tokens)

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

// Items that match a recently-screened item closely enough to fast-track:
// copy the match's hook, mark screened, skip the Claude call entirely.
// Each lookup is an independent network round-trip to Turso — run them
// concurrently in bounded chunks rather than one at a time, since up to 200
// candidates would otherwise serialize 200 round-trips before screening starts.
const DEDUP_LOOKUP_CONCURRENCY = 10

async function fastTrackDuplicates(
  candidates: any[],
  tallies: Map<string, SourceTally>
): Promise<{ remaining: any[]; fastTracked: { item: any; hook: string | null }[] }> {
  const sinceISO = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const remaining: any[] = []
  const fastTracked: { item: any; hook: string | null }[] = []

  const toCheck = candidates.filter(item =>
    !DEDUP_EXCLUDED_SOURCE_PREFIXES.some(p => (item.source as string).startsWith(p))
  )
  for (const item of candidates) {
    if (DEDUP_EXCLUDED_SOURCE_PREFIXES.some(p => (item.source as string).startsWith(p))) remaining.push(item)
  }

  for (let i = 0; i < toCheck.length; i += DEDUP_LOOKUP_CONCURRENCY) {
    const chunk = toCheck.slice(i, i + DEDUP_LOOKUP_CONCURRENCY)
    const matches = await Promise.all(chunk.map(item => findRecentDuplicateFeedItem(item.id, {
      sinceISO,
      excludeSourcePrefixes: DEDUP_EXCLUDED_SOURCE_PREFIXES,
    })))
    for (let j = 0; j < chunk.length; j++) {
      const item = chunk[j]
      const match = matches[j]
      if (match && match.distance < DEDUP_DISTANCE_THRESHOLD) {
        fastTracked.push({ item, hook: match.hook })
        bumpTally(tallies, item.source, 'fastTracked')
      } else {
        remaining.push(item)
      }
    }
  }
  return { remaining, fastTracked }
}

// fastTrackDuplicates only catches cross-run duplicates (it matches against
// screened=1 rows). Two sources covering the same story in the SAME run both
// arrive as screened=0 and would otherwise be screened independently, landing
// in the feed twice. This clusters same-run candidates by embedding distance
// — one representative per cluster goes through fastTrackDuplicates/Claude as
// normal, and the rest inherit whatever outcome the representative gets.
async function clusterSameRunDuplicates(
  candidates: any[]
): Promise<{ representatives: any[]; duplicatesByRep: Map<string, any[]> }> {
  const duplicatesByRep = new Map<string, any[]>()
  if (candidates.length < 2) return { representatives: candidates, duplicatesByRep }

  const order = new Map(candidates.map((c, i) => [c.id as string, i]))
  const parent = new Map<string, string>()
  function find(id: string): string {
    if (!parent.has(id)) parent.set(id, id)
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)!
    parent.set(id, root)
    return root
  }
  // Keep whichever root was fetched earlier as the cluster's representative.
  function union(a: string, b: string): void {
    const ra = find(a), rb = find(b)
    if (ra === rb) return
    if ((order.get(ra) ?? 0) <= (order.get(rb) ?? 0)) parent.set(rb, ra)
    else parent.set(ra, rb)
  }

  const clusterable = candidates.filter(c =>
    !DEDUP_EXCLUDED_SOURCE_PREFIXES.some(p => (c.source as string).startsWith(p))
  )
  if (clusterable.length >= 2) {
    const ids = clusterable.map(c => c.id as string)
    const idPh = ids.map(() => '?').join(',')
    const { rows } = await db.execute({
      sql: `SELECT a.id AS id_a, b.id AS id_b, vector_distance_cos(a.embedding, b.embedding) AS dist
            FROM feed_items a JOIN feed_items b ON a.id < b.id
            WHERE a.id IN (${idPh}) AND b.id IN (${idPh})
              AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL`,
      args: [...ids, ...ids],
    })
    for (const row of rows as any[]) {
      if (typeof row.dist === 'number' && row.dist < DEDUP_DISTANCE_THRESHOLD) {
        union(row.id_a as string, row.id_b as string)
      }
    }
  }

  for (const c of candidates) {
    const root = find(c.id as string)
    if (root === c.id) continue
    if (!duplicatesByRep.has(root)) duplicatesByRep.set(root, [])
    duplicatesByRep.get(root)!.push(c)
  }
  const representatives = candidates.filter(c => find(c.id as string) === c.id)
  return { representatives, duplicatesByRep }
}

// Screen all unscreened items from the DB (screened = 0).
// Deletes irrelevant items, marks relevant ones screened = 1, and sets their hook.
// Returns the kept items + entityMap + toolNames for downstream intel tasks.
export async function screenPendingItems(): Promise<ScreenResult> {
  const runAt = new Date().toISOString()
  const tallies = new Map<string, SourceTally>()

  const { rows } = await db.execute({
    sql: `SELECT id, source, title, url, summary, raw_content, screen_attempts FROM feed_items WHERE screened = 0 ORDER BY fetched_at ASC LIMIT 200`,
    args: [],
  })

  if (!rows.length) return { items: [], entityMap: {}, toolNames: [] }

  const { remaining: candidates, fastTracked } = await fastTrackDuplicates(rows as any[], tallies)
  if (fastTracked.length) console.log(`[hooks] fast-tracked ${fastTracked.length} near-duplicate item(s), skipping Claude`)

  const { representatives, duplicatesByRep } = await clusterSameRunDuplicates(candidates)
  if (duplicatesByRep.size) {
    const dupCount = [...duplicatesByRep.values()].reduce((n, d) => n + d.length, 0)
    console.log(`[hooks] clustered ${dupCount} same-run duplicate(s) into ${duplicatesByRep.size} representative(s)`)
  }

  const BATCH = 30
  const keptRows: { item: any; hook?: string }[] = [...fastTracked.map(({ item, hook }) => ({ item, hook: hook ?? undefined }))]
  const entityMap: Record<string, ExtractedEntity[]> = {}
  const toolsSeen = new Map<string, string>()
  const toDelete: string[] = []
  const toRetry: string[] = []
  let totalInputTokens = 0, totalOutputTokens = 0

  // On Claude failure, leave items unscreened so they retry next run instead of
  // bypassing relevance screening entirely — but cap retries so a poison-pill item
  // (persistent malformed response, recurring API error) can't loop forever.
  // After MAX_SCREEN_ATTEMPTS failures it's dropped, same as a rejected item.
  function handleBatchFailure(batch: any[]): void {
    for (const item of batch) {
      if ((item.screen_attempts ?? 0) + 1 >= MAX_SCREEN_ATTEMPTS) {
        toDelete.push(item.id)
        bumpTally(tallies, item.source, 'rejected')
      } else {
        toRetry.push(item.id)
      }
    }
  }

  for (let i = 0; i < representatives.length; i += BATCH) {
    const batch = representatives.slice(i, i + BATCH)
    const prompt = batch.map((item, n) => {
      const snippet = item.raw_content ? `\n   ${String(item.raw_content).slice(0, SCREENING_SNIPPET_CHARS)}` : ''
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

      totalInputTokens += resp.usage.input_tokens
      totalOutputTokens += resp.usage.output_tokens

      const text = resp.content[0].type === 'text' ? resp.content[0].text : ''
      const match = text.match(/\[[\s\S]*\]/)
      if (!match) {
        console.error('[hooks] no JSON in response')
        handleBatchFailure(batch)
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
        if (entry.relevant === false) {
          toDelete.push(item.id)
          dropped++
          bumpTally(tallies, item.source, 'rejected')
          continue
        }
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
        bumpTally(tallies, item.source, 'accepted')
      }
      console.log(`[hooks] pending batch ${Math.floor(i / BATCH) + 1}: kept ${kept}, dropped ${dropped}`)
    } catch (err) {
      console.error('[hooks] screen error:', err)
      handleBatchFailure(batch)
    }
  }

  // Apply each representative's outcome to its same-run duplicates. If the rep
  // itself ended up neither kept nor deleted (handleBatchFailure left it pending
  // for retry), its duplicates are left pending too — they'll re-cluster next run.
  if (duplicatesByRep.size > 0) {
    const toDeleteSet = new Set(toDelete)
    for (const [repId, dups] of duplicatesByRep) {
      if (toDeleteSet.has(repId)) {
        for (const d of dups) {
          toDelete.push(d.id)
          bumpTally(tallies, d.source, 'rejected')
        }
        continue
      }
      const repEntry = keptRows.find(k => k.item.id === repId)
      if (!repEntry) continue
      for (const d of dups) {
        keptRows.push({ item: d, hook: repEntry.hook })
        bumpTally(tallies, d.source, 'fastTracked')
      }
    }
  }

  if (totalInputTokens || totalOutputTokens) await recordClaudeUsage('screen_pending', totalInputTokens, totalOutputTokens)
  await recordScreeningStats(runAt, tallies)

  // Delete irrelevant items
  if (toDelete.length > 0) {
    const CHUNK = 100
    for (let i = 0; i < toDelete.length; i += CHUNK) {
      const chunk = toDelete.slice(i, i + CHUNK)
      await db.execute({ sql: `DELETE FROM feed_items WHERE id IN (${chunk.map(() => '?').join(',')})`, args: chunk })
    }
    console.log(`[hooks] deleted ${toDelete.length} irrelevant items`)
  }

  // Bump retry count for items left unscreened after a failed batch, so the next
  // run knows how many attempts they've already had
  if (toRetry.length > 0) {
    await db.batch(toRetry.map(id => ({
      sql: `UPDATE feed_items SET screen_attempts = screen_attempts + 1 WHERE id = ?`,
      args: [id],
    })))
    console.log(`[hooks] ${toRetry.length} item(s) failed screening, will retry next run`)
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
