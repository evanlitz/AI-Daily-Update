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
      sql: `SELECT to_type, to_id, edge_type, weight, label FROM graph_edges
            WHERE from_type = ? AND from_id = ?${opts.edgeType ? ' AND edge_type = ?' : ''}`,
      args: opts.edgeType ? [type, id, opts.edgeType] : [type, id],
    })
    for (const r of rows as any[]) {
      results.push({ type: r.to_type, id: r.to_id, edgeType: r.edge_type, weight: r.weight, label: r.label ?? null, direction: 'out' })
    }
  }
  if (direction === 'in' || direction === 'both') {
    const { rows } = await db.execute({
      sql: `SELECT from_type, from_id, edge_type, weight, label FROM graph_edges
            WHERE to_type = ? AND to_id = ?${opts.edgeType ? ' AND edge_type = ?' : ''}`,
      args: opts.edgeType ? [type, id, opts.edgeType] : [type, id],
    })
    for (const r of rows as any[]) {
      results.push({ type: r.from_type, id: r.from_id, edgeType: r.edge_type, weight: r.weight, label: r.label ?? null, direction: 'in' })
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
