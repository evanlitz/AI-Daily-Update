import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

function interleave(items: any[], pageSize: number, offset: number): any[] {
  const bySource: Record<string, any[]> = {}
  for (const item of items) {
    if (!bySource[item.source]) bySource[item.source] = []
    bySource[item.source].push(item)
  }
  const queues = Object.values(bySource)
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const tags = searchParams.get('tags')
  const sort = searchParams.get('sort')
  const q    = searchParams.get('q')?.trim() ?? ''
  const pageSize = 40
  const offset = (page - 1) * pageSize

  const tagList   = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []
  const tagArgs   = tagList.map(t => `%"${t}"%`)

  // ── Full-text search (FTS5, falls back to LIKE) ──────────────────────────
  if (q) {
    const tagWhere = tagList.length > 0
      ? ` AND (${tagList.map(() => `f.topic_tags LIKE ?`).join(' OR ')})`
      : ''
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
      // FTS5 not yet available — fall back to LIKE on title, hook, raw_content
      const tagWhereLike = tagList.length > 0
        ? ` AND (${tagList.map(() => `topic_tags LIKE ?`).join(' OR ')})`
        : ''
      const { rows } = await db.execute({
        sql: `SELECT * FROM feed_items
              WHERE (title LIKE ? OR hook LIKE ? OR raw_content LIKE ?)${tagWhereLike}
              ORDER BY published_at DESC LIMIT ? OFFSET ?`,
        args: [`%${q}%`, `%${q}%`, `%${q}%`, ...tagArgs, pageSize, offset],
      })
      return NextResponse.json(rows.map(parseRow))
    }
  }

  // ── Non-search path (existing sort / interleave logic) ───────────────────
  const tagCondStr = tagList.length > 0
    ? ` WHERE (${tagList.map(() => `topic_tags LIKE ?`).join(' OR ')})`
    : ''

  if (sort === 'velocity') {
    const { rows } = await db.execute({ sql: `SELECT * FROM feed_items${tagCondStr} ORDER BY velocity_score DESC LIMIT ? OFFSET ?`, args: [...tagArgs, pageSize, offset] })
    return NextResponse.json(rows.map(parseRow))
  }
  if (sort === 'recent') {
    const { rows } = await db.execute({ sql: `SELECT * FROM feed_items${tagCondStr} ORDER BY published_at DESC LIMIT ? OFFSET ?`, args: [...tagArgs, pageSize, offset] })
    return NextResponse.json(rows.map(parseRow))
  }
  const { rows: pool } = await db.execute({ sql: `SELECT * FROM feed_items${tagCondStr} ORDER BY published_at DESC LIMIT 400`, args: tagArgs })
  return NextResponse.json(interleave(pool.map(parseRow), pageSize, offset))
}
