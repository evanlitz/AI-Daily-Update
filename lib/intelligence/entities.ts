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
// Half-life for weighting individual co-mentions by age — a mention this old
// counts as half of a fresh one. Applied to the SUM, not the HAVING threshold,
// so a pair still needs MIN_CO_MENTIONS lifetime co-mentions to surface at all;
// this only makes weight fade once it has. 90 days keeps genuinely durable
// pairs (e.g. a lab and its flagship model, mentioned constantly) near the cap
// while letting a one-off pairing from old news drift back down.
const CO_MENTION_HALF_LIFE_DAYS = 90

// SQL-only co-occurrence — entities mentioned in the same feed_item at least
// MIN_CO_MENTIONS times. Deliberately not LLM-confirmed (unlike linkThreads()'s
// Jaccard+Claude-confirm pattern) — validate this free version is useful before
// spending a Claude budget on a semantic upgrade. em1.entity_id < em2.entity_id
// both dedupes each pair to a single row and gives it a canonical ordering, so
// only one direction is ever written; readers match symmetrically (see
// app/api/entities/[id]/route.ts), same pattern thread_relations already uses.
export async function linkCoMentionedEntities(): Promise<void> {
  const { rows } = await db.execute({
    sql: `SELECT em1.entity_id AS a, em2.entity_id AS b, COUNT(*) AS cnt,
                 SUM(pow(0.5, (julianday('now') - julianday(em1.created_at)) / ?)) AS decayed_cnt
          FROM entity_mentions em1
          JOIN entity_mentions em2
            ON em1.source_type = em2.source_type
           AND em1.source_id   = em2.source_id
           AND em1.entity_id   < em2.entity_id
          WHERE em1.source_type = 'feed_item'
          GROUP BY em1.entity_id, em2.entity_id
          HAVING COUNT(*) >= ?`,
    args: [CO_MENTION_HALF_LIFE_DAYS, MIN_CO_MENTIONS],
  }) as { rows: any[] }

  if (!rows.length) return

  for (const row of rows) {
    const weight = Math.min(Number(row.decayed_cnt) / CO_MENTION_WEIGHT_CAP, 1)
    // Guarded so one bad write doesn't abort the loop and drop every remaining
    // pair for this cycle — same convention as predictions.ts's evidence_for write.
    await addEdge('entity', row.a as string, 'entity', row.b as string, 'co_mentioned', {
      weight,
      metadata: { count: Number(row.cnt), decayedCount: Number(row.decayed_cnt) },
    }).catch(err => console.error('[entities] addEdge co_mentioned failed:', err))
  }
  console.log(`[entities] linkCoMentionedEntities: ${rows.length} entity pairs linked`)
}

// Top entities mentioned in a thread's feed items, batched across all thread
// ids in one query. Shared by digest.ts and predictions.ts, which previously
// each had their own byte-for-byte copy of this query.
export async function getEntitiesForThreads(threadIds: string[]): Promise<Map<string, string[]>> {
  const byThread = new Map<string, string[]>()
  if (!threadIds.length) return byThread

  const placeholders = threadIds.map(() => '?').join(',')
  const { rows } = await db.execute({
    sql: `SELECT se.thread_id, e.name, COUNT(DISTINCT em.source_id) AS item_count
          FROM story_events se
          JOIN json_each(se.feed_item_ids) j ON 1=1
          JOIN entity_mentions em ON em.source_id = j.value AND em.source_type = 'feed_item'
          JOIN entities e ON e.id = em.entity_id
          WHERE se.thread_id IN (${placeholders})
          GROUP BY se.thread_id, e.id
          ORDER BY item_count DESC`,
    args: threadIds,
  }) as { rows: any[] }

  for (const row of rows) {
    const list = byThread.get(row.thread_id) ?? []
    if (list.length < 3) list.push(row.name)
    byThread.set(row.thread_id, list)
  }
  return byThread
}

const MIN_TOOL_ASSOCIATION = 3
const TOOL_ASSOCIATION_WEIGHT_CAP = 10
// Same reasoning as CO_MENTION_HALF_LIFE_DAYS — a tool an entity was tied to
// this long ago counts for half as much as a fresh mention.
const TOOL_ASSOCIATION_HALF_LIFE_DAYS = 90

// Same full-table-scan, no-LLM pattern as linkCoMentionedEntities — an entity
// and a tool are "associated" when they co-occur in the same feed_item at
// least MIN_TOOL_ASSOCIATION times, joining entity_mentions against the
// mentions edges radar.ts already writes (feed_item -> tech_radar). Full scan
// every run auto-backfills historical data, same tradeoff already accepted
// for co_mentioned — no separate backfill script needed.
export async function linkEntityToolAssociations(): Promise<void> {
  const { rows } = await db.execute({
    sql: `SELECT em.entity_id AS entity_id, ge.to_id AS tool_id, COUNT(*) AS cnt,
                 SUM(pow(0.5, (julianday('now') - julianday(em.created_at)) / ?)) AS decayed_cnt
          FROM entity_mentions em
          JOIN graph_edges ge
            ON ge.from_type = 'feed_item' AND ge.from_id = em.source_id AND ge.edge_type = 'mentions'
          WHERE em.source_type = 'feed_item'
          GROUP BY em.entity_id, ge.to_id
          HAVING COUNT(*) >= ?`,
    args: [TOOL_ASSOCIATION_HALF_LIFE_DAYS, MIN_TOOL_ASSOCIATION],
  }) as { rows: any[] }

  if (!rows.length) return

  for (const row of rows) {
    const weight = Math.min(Number(row.decayed_cnt) / TOOL_ASSOCIATION_WEIGHT_CAP, 1)
    await addEdge('entity', row.entity_id as string, 'tech_radar', row.tool_id as string, 'associated_with', {
      weight,
      metadata: { count: Number(row.cnt), decayedCount: Number(row.decayed_cnt) },
    }).catch(err => console.error('[entities] addEdge associated_with failed:', err))
  }
  console.log(`[entities] linkEntityToolAssociations: ${rows.length} entity-tool pairs linked`)
}

const RELATIONSHIP_LABELS = new Set(['competitor', 'partner', 'investor', 'acquired', 'subsidiary', 'none'])
const RELATIONSHIP_BATCH_SIZE = 20
// Same budget-per-cycle pattern as radar.ts's classifyToolNames/reclassifyStaleTools —
// a large backlog (e.g. the ~96 co_mentioned pairs that existed when this shipped)
// drains over a few pipeline cycles instead of one giant prompt.
const RELATIONSHIP_TIME_BUDGET_MS = 60_000

function pairKey(a: string, b: string): string {
  return `${a}|${b}`
}

// Up to 2 real article titles both entities of a pair were mentioned in — the
// grounding evidence the classifier is told to rely on instead of training
// knowledge. Small N (one candidate batch's worth of entities), so per-pair
// intersection in JS is fine, same tradeoff getEntitiesForThreads() accepts.
async function gatherPairEvidence(pairs: { a: string; b: string }[]): Promise<Map<string, string[]>> {
  const evidenceByPair = new Map<string, string[]>()
  const ids = [...new Set(pairs.flatMap(p => [p.a, p.b]))]
  if (!ids.length) return evidenceByPair

  const placeholders = ids.map(() => '?').join(',')
  const { rows } = await db.execute({
    sql: `SELECT em.entity_id, em.source_id, fi.title
          FROM entity_mentions em
          JOIN feed_items fi ON fi.id = em.source_id
          WHERE em.source_type = 'feed_item' AND em.entity_id IN (${placeholders})`,
    args: ids,
  }) as { rows: any[] }

  const byEntity = new Map<string, Map<string, string>>()
  for (const row of rows) {
    const m = byEntity.get(row.entity_id) ?? new Map<string, string>()
    m.set(row.source_id, row.title)
    byEntity.set(row.entity_id, m)
  }

  for (const { a, b } of pairs) {
    const ma = byEntity.get(a), mb = byEntity.get(b)
    if (!ma || !mb) continue
    const titles: string[] = []
    for (const [sourceId, title] of ma) {
      if (mb.has(sourceId)) titles.push(title)
      if (titles.length >= 2) break
    }
    if (titles.length) evidenceByPair.set(pairKey(a, b), titles)
  }
  return evidenceByPair
}

const RELATIONSHIP_SYSTEM = `You classify the relationship between pairs of AI-industry entities (companies, people, models) for a knowledge graph, based ONLY on the evidence snippets given for each pair.

Labels — pick exactly one per pair:
- competitor: rival companies/products in the same market
- partner: collaboration, integration, or alliance
- investor: one has invested in / funds the other
- acquired: one has acquired / owns the other
- subsidiary: one is a division or subsidiary of the other
- none: no clear relationship in the evidence — just an incidental co-mention (e.g. both appeared in the same roundup). This is the correct answer most of the time.

For competitor/partner (symmetric), "from" can be either side. For investor/acquired/subsidiary (directional), "from" must be the subject (the investor, the acquirer, the parent) and "to" the object.

CRITICAL: If the evidence doesn't clearly support a specific relationship, output "none" — never assert a relationship from outside/training knowledge that the evidence itself doesn't show.`

async function classifyRelationshipBatch(
  pairs: { a: string; b: string; nameA: string; nameB: string; evidence: string[] }[]
): Promise<void> {
  if (!pairs.length) return

  const input = pairs
    .map((p, i) => `${i}. ${p.nameA} (a) / ${p.nameB} (b)\nEvidence: ${p.evidence.length ? p.evidence.join(' | ') : '(none found — co-mentioned but no shared article title)'}`)
    .join('\n\n')

  const response = await anthropic.messages.create({
    model: MODEL_FAST, max_tokens: 2000,
    system: [{ type: 'text', text: RELATIONSHIP_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Classify these ${pairs.length} entity pairs. Return JSON array only, one entry per index, all indices covered:\n\n${input}\n\n[{"index":0,"label":"competitor|partner|investor|acquired|subsidiary|none","from":"a"|"b"}]` }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  let classified: any[] = []
  try { const m = text.match(/\[[\s\S]*\]/); if (m) classified = JSON.parse(m[0]) } catch { return }

  for (const item of classified) {
    const pair = pairs[item.index]
    if (!pair) continue
    const label = RELATIONSHIP_LABELS.has(item.label) ? item.label : 'none'
    const [fromId, toId] = item.from === 'b' ? [pair.b, pair.a] : [pair.a, pair.b]
    // Written even for 'none' — the edge's existence is what keeps this pair
    // out of the candidate query next cycle, same role co_mentioned's own row
    // plays for backfillEntities(). Readers filter label='none' out.
    await addEdge('entity', fromId, 'entity', toId, 'related_to', {
      label,
      metadata: { evidence: pair.evidence },
    }).catch(err => console.error('[entities] addEdge related_to failed:', err))
  }
}

// Only classifies co_mentioned pairs that don't already have a related_to
// row in either direction — bounds the Claude spend to the delta of newly
// co_mentioned pairs each cycle, not a full rescan. Deliberately built on top
// of linkCoMentionedEntities() rather than replacing it, per that function's
// own comment about validating the free signal before spending a Claude
// budget on a semantic upgrade.
//
// Restricted to company<->company pairs (ea.type='company' AND eb.type=
// 'company') — the label set (competitor/partner/investor/acquired/
// subsidiary) is inherently a corporate-relationship vocabulary. Verified
// against prod data that without this filter, company-vs-model and
// company-vs-person pairs (e.g. Anthropic/Claude, DeepMind/Demis Hassabis)
// get force-fit into the nearest-sounding label — "Claude is a subsidiary of
// Anthropic" is simply wrong, not a matter of confidence. "Maker of"/
// "affiliated with" relationships are a different, separate feature to add
// later with their own label set, not squeezed into this one.
export async function classifyEntityRelationships(): Promise<void> {
  const { rows: candidateRows } = await db.execute(`
    SELECT ge.from_id AS a, ge.to_id AS b
    FROM graph_edges ge
    JOIN entities ea ON ea.id = ge.from_id
    JOIN entities eb ON eb.id = ge.to_id
    WHERE ge.edge_type = 'co_mentioned'
      AND ea.type = 'company' AND eb.type = 'company'
      AND NOT EXISTS (
        SELECT 1 FROM graph_edges r
        WHERE r.edge_type = 'related_to' AND r.from_type = 'entity' AND r.to_type = 'entity'
          AND ((r.from_id = ge.from_id AND r.to_id = ge.to_id) OR (r.from_id = ge.to_id AND r.to_id = ge.from_id))
      )
    ORDER BY ge.weight DESC
  `) as { rows: any[] }
  if (!candidateRows.length) return

  const pairs = candidateRows.map(r => ({ a: r.a as string, b: r.b as string }))
  const ids = [...new Set(pairs.flatMap(p => [p.a, p.b]))]
  const { rows: nameRows } = await db.execute({
    sql: `SELECT id, name FROM entities WHERE id IN (${ids.map(() => '?').join(',')})`,
    args: ids,
  }) as { rows: any[] }
  const nameById = new Map(nameRows.map(r => [r.id as string, r.name as string]))
  const evidenceByPair = await gatherPairEvidence(pairs)

  const enriched = pairs
    .filter(p => nameById.has(p.a) && nameById.has(p.b))
    .map(p => ({
      a: p.a, b: p.b,
      nameA: nameById.get(p.a)!, nameB: nameById.get(p.b)!,
      evidence: evidenceByPair.get(pairKey(p.a, p.b)) ?? [],
    }))

  const loopStart = Date.now()
  let classified = 0
  for (let i = 0; i < enriched.length; i += RELATIONSHIP_BATCH_SIZE) {
    if (Date.now() - loopStart > RELATIONSHIP_TIME_BUDGET_MS) {
      console.warn(`[entities] classifyEntityRelationships time budget hit — ${enriched.length - i} pair(s) left for next run`)
      break
    }
    await classifyRelationshipBatch(enriched.slice(i, i + RELATIONSHIP_BATCH_SIZE))
    classified += Math.min(RELATIONSHIP_BATCH_SIZE, enriched.length - i)
  }
  console.log(`[entities] classifyEntityRelationships: ${classified} pair(s) classified`)
}

// company<->model ("maker_of") and company<->person ("affiliated_with") pairs
// were deliberately excluded from classifyEntityRelationships() — sending
// them through that company-only pass previously forced them into the wrong
// corporate label ("Claude is a subsidiary of Anthropic"). Same edge type
// (related_to), same batching/evidence pattern, but its own narrow label set
// and — critically — a validation step after classification that discards
// any label that doesn't actually match the pair's entity types, rather than
// trusting Claude's output blindly like the pre-bugfix version did.
const AFFILIATION_TIME_BUDGET_MS = 60_000
const AFFILIATION_BATCH_SIZE = 20

const AFFILIATION_SYSTEM = `You classify two specific kinds of relationships between AI-industry entities, based ONLY on the evidence snippets given for each pair.

For a COMPANY + MODEL pair: label "maker_of" if the evidence shows that company created, released, or develops that model. Otherwise "none".

For a COMPANY + PERSON pair: label "affiliated_with" if the evidence shows that person is meaningfully associated with that company (founder, CEO, executive, researcher, employee). Otherwise "none".

CRITICAL: If the evidence doesn't clearly support the relationship, output "none" — never assert one from outside/training knowledge that the evidence itself doesn't show. "none" is the correct answer whenever the pair is just incidentally co-mentioned.`

interface AffiliationCandidate {
  companyId: string
  otherId: string
  companyName: string
  otherName: string
  otherType: 'model' | 'researcher'
  evidence: string[]
}

async function classifyAffiliationBatch(pairs: AffiliationCandidate[]): Promise<void> {
  if (!pairs.length) return

  const input = pairs
    .map((p, i) => `${i}. ${p.companyName} (company) / ${p.otherName} (${p.otherType})\nEvidence: ${p.evidence.length ? p.evidence.join(' | ') : '(none found — co-mentioned but no shared article title)'}`)
    .join('\n\n')

  const response = await anthropic.messages.create({
    model: MODEL_FAST, max_tokens: 2000,
    system: [{ type: 'text', text: AFFILIATION_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Classify these ${pairs.length} pairs. Return JSON array only, one entry per index, all indices covered:\n\n${input}\n\n[{"index":0,"label":"maker_of"|"affiliated_with"|"none"}]` }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  let classified: any[] = []
  try { const m = text.match(/\[[\s\S]*\]/); if (m) classified = JSON.parse(m[0]) } catch { return }

  const expectedLabel: Record<AffiliationCandidate['otherType'], string> = {
    model: 'maker_of',
    researcher: 'affiliated_with',
  }

  for (const item of classified) {
    const pair = pairs[item.index]
    if (!pair) continue
    // Discard rather than trust: a label is only kept if it matches what this
    // pair's own type-shape allows. Anything else (including a hallucinated
    // label outside the two valid ones) collapses to 'none'.
    const label = item.label === expectedLabel[pair.otherType] ? item.label : 'none'
    await addEdge('entity', pair.companyId, 'entity', pair.otherId, 'related_to', {
      label,
      metadata: { evidence: pair.evidence },
    }).catch(err => console.error('[entities] addEdge related_to (affiliation) failed:', err))
  }
}

export async function classifyEntityAffiliations(): Promise<void> {
  const { rows: candidateRows } = await db.execute(`
    SELECT ge.from_id AS a, ge.to_id AS b, ea.type AS type_a, eb.type AS type_b
    FROM graph_edges ge
    JOIN entities ea ON ea.id = ge.from_id
    JOIN entities eb ON eb.id = ge.to_id
    WHERE ge.edge_type = 'co_mentioned'
      AND (
        (ea.type = 'company' AND eb.type IN ('model', 'researcher'))
        OR (eb.type = 'company' AND ea.type IN ('model', 'researcher'))
      )
      AND NOT EXISTS (
        SELECT 1 FROM graph_edges r
        WHERE r.edge_type = 'related_to' AND r.from_type = 'entity' AND r.to_type = 'entity'
          AND ((r.from_id = ge.from_id AND r.to_id = ge.to_id) OR (r.from_id = ge.to_id AND r.to_id = ge.from_id))
      )
    ORDER BY ge.weight DESC
  `) as { rows: any[] }
  if (!candidateRows.length) return

  // Normalize so companyId/otherId is consistent regardless of which side
  // co_mentioned happened to store as from/to (that ordering is just
  // alphabetical by id, not type-aware).
  const pairs = candidateRows.map(r => {
    const aIsCompany = r.type_a === 'company'
    return {
      companyId: aIsCompany ? (r.a as string) : (r.b as string),
      otherId: aIsCompany ? (r.b as string) : (r.a as string),
      otherType: (aIsCompany ? r.type_b : r.type_a) as 'model' | 'researcher',
    }
  })

  const ids = [...new Set(pairs.flatMap(p => [p.companyId, p.otherId]))]
  const { rows: nameRows } = await db.execute({
    sql: `SELECT id, name FROM entities WHERE id IN (${ids.map(() => '?').join(',')})`,
    args: ids,
  }) as { rows: any[] }
  const nameById = new Map(nameRows.map(r => [r.id as string, r.name as string]))
  const evidenceByPair = await gatherPairEvidence(pairs.map(p => ({ a: p.companyId, b: p.otherId })))

  const enriched: AffiliationCandidate[] = pairs
    .filter(p => nameById.has(p.companyId) && nameById.has(p.otherId))
    .map(p => ({
      companyId: p.companyId, otherId: p.otherId, otherType: p.otherType,
      companyName: nameById.get(p.companyId)!, otherName: nameById.get(p.otherId)!,
      evidence: evidenceByPair.get(pairKey(p.companyId, p.otherId)) ?? [],
    }))

  const loopStart = Date.now()
  let classified = 0
  for (let i = 0; i < enriched.length; i += AFFILIATION_BATCH_SIZE) {
    if (Date.now() - loopStart > AFFILIATION_TIME_BUDGET_MS) {
      console.warn(`[entities] classifyEntityAffiliations time budget hit — ${enriched.length - i} pair(s) left for next run`)
      break
    }
    await classifyAffiliationBatch(enriched.slice(i, i + AFFILIATION_BATCH_SIZE))
    classified += Math.min(AFFILIATION_BATCH_SIZE, enriched.length - i)
  }
  console.log(`[entities] classifyEntityAffiliations: ${classified} pair(s) classified`)
}
