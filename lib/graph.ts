import db from './db'
import { safeJSON } from './utils'

// Node identities reference existing primary keys in their own tables directly
// (entities.id, feed_items.id, story_threads.id, ai_predictions.id, ai_models.id,
// tech_radar.id) — graph_edges adds no node table of its own. Extend this union
// when a future phase needs a type it doesn't cover yet.
export type NodeType =
  | 'entity'
  | 'feed_item'
  | 'story_thread'
  | 'prediction'
  | 'ai_model'
  | 'tech_radar'

// Extend this union (not a free string) so producers can't invent
// near-duplicate names for the same relationship.
export type EdgeType =
  | 'evidence_for'   // prediction -> story_thread | feed_item (Phase 3)
  | 'co_mentioned'   // entity <-> entity (Phase 4)
  | 'mentions'       // feed_item -> tech_radar (Phase 5)
  | 'introduced_by'  // ai_model -> feed_item (Phase 6)
  | 'supersedes'     // ai_model -> ai_model (Phase 6)
  | 'associated_with' // entity -> tech_radar (Phase 7)
  | 'related_to'      // entity <-> entity, typed relationship — kind lives in
                       // `label` (competitor|partner|investor|acquired|subsidiary|none) (Phase 8)

export interface EdgeOpts {
  weight?: number   // normalized 0-1 confidence — always. Raw counts go in metadata, not weight.
  label?: string
  metadata?: Record<string, unknown>
}

export interface Neighbor {
  type: string
  id: string
  edgeType: string
  weight: number
  label: string | null
  updatedAt: string
  direction: 'out' | 'in'
}

export interface TraversedNode {
  type: string
  id: string
  depth: number
}

export async function addEdge(
  fromType: NodeType,
  fromId: string,
  toType: NodeType,
  toId: string,
  edgeType: EdgeType,
  opts: EdgeOpts = {}
): Promise<void> {
  const now = new Date().toISOString()
  await db.execute({
    sql: `INSERT INTO graph_edges (from_type, from_id, to_type, to_id, edge_type, weight, label, metadata, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(from_type, from_id, to_type, to_id, edge_type) DO UPDATE SET
            weight     = excluded.weight,
            label      = excluded.label,
            metadata   = excluded.metadata,
            updated_at = excluded.updated_at`,
    args: [
      fromType, fromId, toType, toId, edgeType,
      opts.weight ?? 1.0, opts.label ?? null, JSON.stringify(opts.metadata ?? {}),
      now, now,
    ],
  })
}

// Call from every hard-delete path touching a node-like table (deleteStoryThread,
// pruneOldFeedItems, any future entity/prediction/model delete) in the same phase
// that starts referencing that type — graph_edges has no FK to catch this for you.
export async function removeEdgesFor(type: NodeType, id: string): Promise<void> {
  await db.execute({
    sql: `DELETE FROM graph_edges WHERE (from_type = ? AND from_id = ?) OR (to_type = ? AND to_id = ?)`,
    args: [type, id, type, id],
  })
}

export async function getNeighbors(
  type: NodeType,
  id: string,
  opts: { edgeType?: EdgeType; direction?: 'out' | 'in' | 'both' } = {}
): Promise<Neighbor[]> {
  const direction = opts.direction ?? 'both'
  const results: Neighbor[] = []

  if (direction === 'out' || direction === 'both') {
    const { rows } = await db.execute({
      sql: `SELECT to_type, to_id, edge_type, weight, label, updated_at FROM graph_edges
            WHERE from_type = ? AND from_id = ?${opts.edgeType ? ' AND edge_type = ?' : ''}`,
      args: opts.edgeType ? [type, id, opts.edgeType] : [type, id],
    })
    for (const r of rows as any[]) {
      results.push({ type: r.to_type, id: r.to_id, edgeType: r.edge_type, weight: r.weight, label: r.label ?? null, updatedAt: r.updated_at, direction: 'out' })
    }
  }
  if (direction === 'in' || direction === 'both') {
    const { rows } = await db.execute({
      sql: `SELECT from_type, from_id, edge_type, weight, label, updated_at FROM graph_edges
            WHERE to_type = ? AND to_id = ?${opts.edgeType ? ' AND edge_type = ?' : ''}`,
      args: opts.edgeType ? [type, id, opts.edgeType] : [type, id],
    })
    for (const r of rows as any[]) {
      results.push({ type: r.from_type, id: r.from_id, edgeType: r.edge_type, weight: r.weight, label: r.label ?? null, updatedAt: r.updated_at, direction: 'in' })
    }
  }
  return results
}

// maxDepth is capped in the signature (2-3), not caller-configurable to an
// arbitrary integer — UNION only dedupes identical (type,id,depth) tuples per
// step, not the same node re-reached at different depths, so row count before
// the final GROUP BY is O(branching_factor^depth). Fine at 2-3 hops on this
// table's realistic scale; not fine as an open-ended crawl.
export async function traverse(type: NodeType, id: string, maxDepth: 2 | 3 = 2): Promise<TraversedNode[]> {
  const { rows } = await db.execute({
    sql: `WITH RECURSIVE walk(node_type, node_id, depth) AS (
            SELECT ?, ?, 0
            UNION
            SELECT
              CASE WHEN ge.from_type = w.node_type AND ge.from_id = w.node_id THEN ge.to_type ELSE ge.from_type END,
              CASE WHEN ge.from_type = w.node_type AND ge.from_id = w.node_id THEN ge.to_id   ELSE ge.from_id   END,
              w.depth + 1
            FROM graph_edges ge
            JOIN walk w ON (ge.from_type = w.node_type AND ge.from_id = w.node_id)
                       OR (ge.to_type   = w.node_type AND ge.to_id   = w.node_id)
            WHERE w.depth < ?
          )
          SELECT node_type, node_id, MIN(depth) AS depth
          FROM walk
          WHERE depth > 0 AND NOT (node_type = ? AND node_id = ?)
          GROUP BY node_type, node_id
          ORDER BY depth`,
    args: [type, id, maxDepth, type, id],
  })
  return (rows as any[]).map(r => ({ type: r.node_type as string, id: r.node_id as string, depth: Number(r.depth) }))
}

export function parseEdgeMetadata(raw: string | null | undefined): Record<string, unknown> {
  return safeJSON(raw ?? '{}', {})
}

export interface EdgeTypeHealth {
  edgeType: string
  count: number
  lastUpdated: string | null
}

// Per-edge-type count + freshness, read straight off graph_edges.updated_at —
// no separate run-log needed since every producer (lib/pipeline.ts phase 2,
// lib/intelligence/radar.ts, lib/intelligence/models.ts) already goes through
// addEdge()'s ON CONFLICT...DO UPDATE, so updated_at reflects the last time
// that edge type was actually touched. Deliberately no staleness threshold —
// producers run on different real-world cadences (a new model release for
// supersedes/introduced_by vs. every pipeline cycle for co_mentioned), so a
// fixed "N hours = stale" cutoff would false-alarm on the sparser ones.
export async function getGraphHealth(): Promise<{ totalEdges: number; byType: EdgeTypeHealth[] }> {
  const { rows } = await db.execute(
    `SELECT edge_type, COUNT(*) AS cnt, MAX(updated_at) AS last_updated FROM graph_edges GROUP BY edge_type ORDER BY edge_type ASC`
  ) as { rows: any[] }
  const byType = rows.map(r => ({
    edgeType: r.edge_type as string,
    count: Number(r.cnt),
    lastUpdated: (r.last_updated as string | null) ?? null,
  }))
  return { totalEdges: byType.reduce((sum, r) => sum + r.count, 0), byType }
}

export interface KnownRelationship {
  nameA: string
  nameB: string
  label: string
}

// Most-recently-classified typed entity relationships. Global top-N rather
// than targeted to a specific set of entities already in a caller's context —
// the dataset is small enough (tens of pairs) that a stable "known
// relationships" block is simpler than plumbing entity ids through from each
// caller's thread/tool lookups, and still gives Claude real grounding to
// reference instead of guessing at industry relationships.
//
// Explicitly scoped to the 5 corporate labels (not just "!= 'none'") — the
// predictions/advisor/digest prompts that consume this call it a "Known
// relationships between companies" block, and maker_of/affiliated_with
// (company<->model, company<->person) would silently break that framing if
// a future label got added here without a matching prompt update. Entity
// pages read related_to directly via getNeighbors() and are unaffected by
// this filter — they show every label, this is generation-context only.
const CORPORATE_RELATIONSHIP_LABELS = ['competitor', 'partner', 'investor', 'acquired', 'subsidiary']

export async function getKnownRelationships(limit = 20): Promise<KnownRelationship[]> {
  const labelPlaceholders = CORPORATE_RELATIONSHIP_LABELS.map(() => '?').join(',')
  const { rows } = await db.execute({
    sql: `SELECT ea.name AS name_a, eb.name AS name_b, ge.label FROM graph_edges ge
          JOIN entities ea ON ea.id = ge.from_id
          JOIN entities eb ON eb.id = ge.to_id
          WHERE ge.edge_type = 'related_to' AND ge.label IN (${labelPlaceholders})
            AND ge.from_type = 'entity' AND ge.to_type = 'entity'
          ORDER BY ge.updated_at DESC
          LIMIT ?`,
    args: [...CORPORATE_RELATIONSHIP_LABELS, limit],
  }) as { rows: any[] }
  return rows.map(r => ({ nameA: r.name_a as string, nameB: r.name_b as string, label: r.label as string }))
}

// "acquired of"/"investor of" read as broken English — a small verb map beats
// a generic "A — label of — B" template that only actually works for two of
// the five labels.
const RELATIONSHIP_VERB: Record<string, string> = {
  competitor: 'competes with',
  partner: 'partners with',
  investor: 'has invested in',
  acquired: 'acquired',
  subsidiary: 'is a subsidiary of',
}

export function formatKnownRelationships(rels: KnownRelationship[]): string {
  return rels.map(r => `${r.nameA} ${RELATIONSHIP_VERB[r.label] ?? r.label} ${r.nameB}`).join('\n')
}

// Entities associated_with each tool, batched into 2 queries total regardless
// of tool count — one IN-clause lookup over graph_edges, one over entities.
// Shared by advisor-context.ts and predictions.ts, which previously each had
// their own copy that called getNeighbors() once per tool (an unbounded N+1
// fan-out of Turso round-trips for advisor's uncapped adopt+trial tool list).
export async function getEntitiesForTools(tools: { id: string; name: string }[]): Promise<Map<string, string[]>> {
  const byTool = new Map<string, string[]>()
  if (!tools.length) return byTool

  const toolPlaceholders = tools.map(() => '?').join(',')
  const { rows } = await db.execute({
    sql: `SELECT from_id AS entity_id, to_id AS tool_id, weight FROM graph_edges
          WHERE edge_type = 'associated_with' AND from_type = 'entity' AND to_type = 'tech_radar'
            AND to_id IN (${toolPlaceholders})`,
    args: tools.map(t => t.id),
  }) as { rows: any[] }
  if (!rows.length) return byTool

  const entityIds = [...new Set(rows.map(r => r.entity_id))]
  const entityPlaceholders = entityIds.map(() => '?').join(',')
  const { rows: entityRows } = await db.execute({
    sql: `SELECT id, name FROM entities WHERE id IN (${entityPlaceholders})`,
    args: entityIds,
  }) as { rows: any[] }
  const nameById = new Map(entityRows.map(r => [r.id, r.name as string]))

  const byToolRaw = new Map<string, { name: string; weight: number }[]>()
  for (const row of rows) {
    const name = nameById.get(row.entity_id)
    if (!name) continue
    const list = byToolRaw.get(row.tool_id) ?? []
    list.push({ name, weight: row.weight })
    byToolRaw.set(row.tool_id, list)
  }
  for (const [toolId, list] of byToolRaw) {
    byTool.set(toolId, list.sort((a, b) => b.weight - a.weight).slice(0, 3).map(x => x.name))
  }
  return byTool
}
