import crypto from 'crypto'
import { VoyageAIClient } from 'voyageai'
import db from './db'
import { sanitizeText } from './utils'

// Reads VOYAGE_API_KEY from the environment itself — passing apiKey: undefined
// explicitly would skip the SDK's own env-var fallback.
const voyage = new VoyageAIClient()
const EMBED_MODEL = 'voyage-3-lite'
const EMBED_DIM = 512

// Voyage's asymmetric embedding mode: embed stored content as 'document' and
// search queries as 'query' — the two get different internal representations
// tuned for retrieval, which beats embedding both sides identically.
export async function embed(texts: string[], inputType: 'document' | 'query'): Promise<number[][]> {
  if (!texts.length) return []
  const response = await voyage.embed({
    input: texts,
    model: EMBED_MODEL,
    inputType,
    outputDimension: EMBED_DIM,
  })
  return (response.data ?? []).map(d => d.embedding ?? [])
}

export interface RememberEntry {
  kind: string
  refId?: string
  text: string
  metadata?: Record<string, unknown>
}

// Stores one of Claude's own past outputs (e.g. a digest highlight) so a
// later recall() call can find it by meaning, not by exact week/date filter.
export async function remember(entry: RememberEntry): Promise<void> {
  const text = sanitizeText(entry.text)
  if (!text) return
  const [vec] = await embed([text], 'document')
  if (!vec.length) return

  await db.execute({
    sql: `INSERT INTO memories (id, kind, ref_id, text, metadata, embedding, created_at) VALUES (?, ?, ?, ?, ?, vector32(?), ?)`,
    args: [
      crypto.randomUUID(),
      entry.kind,
      entry.refId ?? null,
      text,
      JSON.stringify(entry.metadata ?? {}),
      JSON.stringify(vec),
      new Date().toISOString(),
    ],
  })
}

// Stores a memory for a mutable entity (e.g. a prediction row that gets
// rewritten on every refresh) — unlike remember(), which only appends.
// Without this, recall() would surface stale superseded copies ranked
// alongside the current one. Deletes any existing memory for (kind, refId)
// before inserting, so there's always exactly one live memory per entity.
export async function rememberEntity(entry: RememberEntry & { refId: string }): Promise<void> {
  const text = sanitizeText(entry.text)
  if (!text) return
  const [vec] = await embed([text], 'document')
  if (!vec.length) return

  await db.execute({
    sql: `DELETE FROM memories WHERE kind = ? AND ref_id = ?`,
    args: [entry.kind, entry.refId],
  })
  await db.execute({
    sql: `INSERT INTO memories (id, kind, ref_id, text, metadata, embedding, created_at) VALUES (?, ?, ?, ?, ?, vector32(?), ?)`,
    args: [
      crypto.randomUUID(),
      entry.kind,
      entry.refId,
      text,
      JSON.stringify(entry.metadata ?? {}),
      JSON.stringify(vec),
      new Date().toISOString(),
    ],
  })
}

export interface RecallResult {
  id: string
  refId: string | null
  text: string
  metadata: Record<string, unknown>
  distance: number
}

// Semantic search over memories — finds past Claude outputs related to
// `query` regardless of how long ago they were written.
export async function recall(query: string, opts: { k?: number; kind?: string } = {}): Promise<RecallResult[]> {
  const k = opts.k ?? 5
  try {
    const [vec] = await embed([query], 'query')
    if (!vec.length) return []

    // vector_top_k() applies its LIMIT before any WHERE can run against the
    // joined table, so a kind filter needs an over-fetch margin to avoid
    // coming back with fewer than k matches when the nearest global neighbors
    // skew toward other kinds — this isn't pure waste, it's what makes
    // kind-filtering correct at all without a per-kind vector index.
    const fetchK = opts.kind ? k * 4 : k

    // vector_top_k() only returns a row id locally (no distance column despite
    // Turso's hosted docs showing one) — compute distance separately via
    // vector_distance_cos(). Filtering by kind happens in this same query (one
    // round trip), but MUST go in an outer SELECT over a CTE, not an inline
    // WHERE tacked onto the join — an inline `WHERE m.kind = ?` right after
    // `JOIN memories m ON m.rowid = vt.id` gets mis-planned alongside the
    // vector_top_k table-valued function and silently returns the wrong rows
    // (verified empirically: same query, only difference is CTE vs inline
    // WHERE, inline version dropped real matches with no error of any kind).
    const { rows } = await db.execute({
      sql: `WITH candidates AS (
              SELECT m.id, m.ref_id, m.text, m.metadata, m.kind,
                     vector_distance_cos(m.embedding, vector32(?)) AS distance
              FROM vector_top_k('memories_vec_idx', vector32(?), ?) vt
              JOIN memories m ON m.rowid = vt.id
            )
            SELECT * FROM candidates
            ${opts.kind ? 'WHERE kind = ?' : ''}
            ORDER BY distance ASC`,
      args: opts.kind
        ? [JSON.stringify(vec), JSON.stringify(vec), fetchK, opts.kind]
        : [JSON.stringify(vec), JSON.stringify(vec), fetchK],
    })

    return (rows as any[])
      .map(r => ({
        id: r.id as string,
        refId: (r.ref_id as string | null) ?? null,
        text: r.text as string,
        metadata: JSON.parse(r.metadata ?? '{}'),
        distance: r.distance as number,
      }))
      .slice(0, k)
  } catch (err) {
    // Logged here, not just at call sites — callers commonly do
    // recall(...).catch(() => []) for resilience against a real Voyage outage,
    // which would otherwise silently mask a real bug (e.g. a SQL error) as
    // "no results found" with zero visibility.
    console.error('[memory] recall failed:', err)
    return []
  }
}

export interface EmbedFeedItemInput {
  id: string
  title: string
  text: string
}

// Embeds and stores vectors for feed_items rows that don't have one yet.
// Called post-screening (lib/pipeline.ts) so irrelevant items never get embedded.
export async function embedFeedItems(items: EmbedFeedItemInput[]): Promise<void> {
  if (!items.length) return
  const texts = items.map(item => sanitizeText(`${item.title}\n${item.text}`.slice(0, 2000)))
  const vectors = await embed(texts, 'document')

  const statements = items
    .map((item, i) => ({ id: item.id, vec: vectors[i] }))
    .filter(({ vec }) => vec?.length)
    .map(({ id, vec }) => ({
      sql: `UPDATE feed_items SET embedding = vector32(?) WHERE id = ?`,
      args: [JSON.stringify(vec), id],
    }))
  if (statements.length) await db.batch(statements as any)
}

export interface RecallFeedItemResult {
  id: string
  title: string
  distance: number
}

// Semantic search over ingested raw content — finds related items by meaning
// instead of a SQL WHERE clause on tags/dates.
export async function recallFeedItems(query: string, k = 10): Promise<RecallFeedItemResult[]> {
  try {
    const [vec] = await embed([query], 'query')
    if (!vec.length) return []

    const { rows } = await db.execute({
      sql: `SELECT f.id, f.title,
                   vector_distance_cos(f.embedding, vector32(?)) AS distance
            FROM vector_top_k('feed_items_vec_idx', vector32(?), ?) vt
            JOIN feed_items f ON f.rowid = vt.id`,
      args: [JSON.stringify(vec), JSON.stringify(vec), k],
    })

    return (rows as any[]).map(r => ({
      id: r.id as string,
      title: r.title as string,
      distance: r.distance as number,
    }))
  } catch (err) {
    console.error('[memory] recallFeedItems failed:', err)
    return []
  }
}
