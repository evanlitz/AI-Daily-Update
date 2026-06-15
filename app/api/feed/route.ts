import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

// Round-robin interleave by source.
// If a score fn is provided: sorts each source's queue by score, and orders
// the source queues themselves by their top item's score (preferred sources first).
function interleave(
  items: any[],
  pageSize: number,
  offset: number,
  score?: (item: any) => number,
): any[] {
  const bySource: Record<string, any[]> = {}
  for (const item of items) {
    if (!bySource[item.source]) bySource[item.source] = []
    bySource[item.source].push(item)
  }

  if (score) {
    for (const q of Object.values(bySource)) q.sort((a, b) => score(b) - score(a))
  }

  const queues = score
    ? Object.values(bySource).sort((a, b) => score(b[0]) - score(a[0]))
    : Object.values(bySource)

  const result: any[] = []
  let i = 0
  while (result.length < items.length) {
    let advanced = false
    for (const q of queues) { if (i < q.length) { result.push(q[i]); advanced = true } }
    if (!advanced) break
    i++
  }
  return result.slice(offset, offset + pageSize)
}

function parseRow(i: any) {
  return { ...i, topic_tags: JSON.parse(i.topic_tags ?? '[]') }
}

// Build per-request affinity lookup from the user_affinity table.
// Returns a boost function (0–1) and a hasAffinity flag.
async function loadAffinity() {
  const { rows } = await db.execute(
    `SELECT source, category, read_count, open_count FROM user_affinity`
  )

  const sourceScore: Record<string, number> = {}
  const tagScore: Record<string, number> = {}
  for (const row of rows as any[]) {
    // opens weighted 2× reads — opening an item is a stronger signal than just marking it read
    const s = (row.read_count ?? 0) + (row.open_count ?? 0) * 2
    sourceScore[row.source] = (sourceScore[row.source] ?? 0) + s
    tagScore[row.category]  = (tagScore[row.category]  ?? 0) + s
  }

  const maxSrc = Object.values(sourceScore).reduce((m, v) => Math.max(m, v), 1)
  const maxTag = Object.values(tagScore).reduce((m, v) => Math.max(m, v), 1)
  const hasAffinity = rows.length > 0

  function affinityBoost(item: any): number {
    if (!hasAffinity) return 0
    const tags: string[] = Array.isArray(item.topic_tags)
      ? item.topic_tags
      : JSON.parse(item.topic_tags ?? '[]')
    const src = (sourceScore[item.source] ?? 0) / maxSrc
    const tag = tags.length > 0
      ? Math.max(...tags.map((t: string) => (tagScore[t] ?? 0) / maxTag))
      : 0
    return (src + tag) / 2  // 0–1
  }

  return { affinityBoost, hasAffinity }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const tags     = searchParams.get('tags')
  const sort     = searchParams.get('sort')
  const q        = searchParams.get('q')?.trim() ?? ''
  const pageSize = 40
  const offset   = (page - 1) * pageSize

  const tagList = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []
  const tagArgs = tagList.map(t => `%"${t}"%`)

  // ── Full-text search — no affinity applied (query intent overrides preference) ──
  if (q) {
    const tagWhere = tagList.length > 0
      ? ` AND f.screened = 1 AND (${tagList.map(() => `f.topic_tags LIKE ?`).join(' OR ')})`
      : ` AND f.screened = 1`
    try {
      const ftsQ = q.replace(/["()]/g, ' ').trim()
      const { rows } = await db.execute({
        sql: `SELECT f.* FROM feed_items f
              JOIN feed_items_fts fts ON fts.rowid = f.rowid
              WHERE fts MATCH ?${tagWhere}
              ORDER BY fts.rank
              LIMIT ? OFFSET ?`,
        args: [ftsQ, ...tagArgs, pageSize, offset],
      })
      return NextResponse.json(rows.map(parseRow))
    } catch {
      const tagWhereLike = tagList.length > 0
        ? ` AND (${tagList.map(() => `topic_tags LIKE ?`).join(' OR ')})`
        : ''
      const { rows } = await db.execute({
        sql: `SELECT * FROM feed_items
              WHERE screened = 1 AND (title LIKE ? OR hook LIKE ? OR raw_content LIKE ?)${tagWhereLike}
              ORDER BY published_at DESC LIMIT ? OFFSET ?`,
        args: [`%${q}%`, `%${q}%`, `%${q}%`, ...tagArgs, pageSize, offset],
      })
      return NextResponse.json(rows.map(parseRow))
    }
  }

  const { affinityBoost, hasAffinity } = await loadAffinity()

  const tagCondStr = tagList.length > 0
    ? ` WHERE screened = 1 AND (${tagList.map(() => `topic_tags LIKE ?`).join(' OR ')})`
    : ` WHERE screened = 1`

  // ── Velocity sort: blend velocity (60%) + affinity (40%) ─────────────────
  if (sort === 'velocity') {
    const { rows } = await db.execute({
      sql:  `SELECT * FROM feed_items${tagCondStr} ORDER BY velocity_score DESC LIMIT 400`,
      args: tagArgs,
    })
    const pool = rows.map(parseRow)
    if (hasAffinity) {
      pool.sort((a, b) =>
        (b.velocity_score * 0.6 + affinityBoost(b) * 0.4) -
        (a.velocity_score * 0.6 + affinityBoost(a) * 0.4)
      )
    }
    return NextResponse.json(pool.slice(offset, offset + pageSize))
  }

  // ── Recent sort: explicit chronological request — leave untouched ─────────
  if (sort === 'recent') {
    const { rows } = await db.execute({
      sql:  `SELECT * FROM feed_items${tagCondStr} ORDER BY published_at DESC LIMIT ? OFFSET ?`,
      args: [...tagArgs, pageSize, offset],
    })
    return NextResponse.json(rows.map(parseRow))
  }

  // ── Default: interleave with affinity-aware scoring ───────────────────────
  // Each source queue is sorted by blended score (recency 50% + affinity 50%).
  // Source queues themselves are ordered so preferred sources appear first each round.
  const { rows: pool } = await db.execute({
    sql:  `SELECT * FROM feed_items${tagCondStr} ORDER BY published_at DESC LIMIT 400`,
    args: tagArgs,
  })

  const scoreFn = hasAffinity
    ? (item: any): number => {
        const ageHours = (Date.now() - new Date(item.published_at ?? item.fetched_at).getTime()) / 3_600_000
        const recency  = Math.max(0, 1 - ageHours / 336)  // 0 at 14 days, 1 at now
        return recency * 0.5 + affinityBoost(item) * 0.5
      }
    : undefined

  return NextResponse.json(interleave(pool.map(parseRow), pageSize, offset, scoreFn))
}
