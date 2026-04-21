import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

// Round-robin interleave: ensures every source gets representation instead of
// one prolific source (e.g. Raschka dumping 100 posts) crowding out everything.
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
    for (const q of queues) {
      if (i < q.length) { result.push(q[i]); advanced = true }
    }
    if (!advanced) break
    i++
  }
  return result.slice(offset, offset + pageSize)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const tags = searchParams.get('tags')
  const sort = searchParams.get('sort') // 'velocity' | 'recent' | 'mixed' (default)
  const pageSize = 40
  const offset = (page - 1) * pageSize

  let where = ''
  const params: any[] = []

  if (tags) {
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
    if (tagList.length > 0) {
      const conditions = tagList.map(() => `topic_tags LIKE ?`).join(' OR ')
      where = ` WHERE (${conditions})`
      params.push(...tagList.map(t => `%"${t}"%`))
    }
  }

  if (sort === 'velocity') {
    const items = db.prepare(`SELECT * FROM feed_items${where} ORDER BY velocity_score DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset) as any[]
    return NextResponse.json(items.map(i => ({ ...i, topic_tags: JSON.parse(i.topic_tags ?? '[]') })))
  }

  if (sort === 'recent') {
    const items = db.prepare(`SELECT * FROM feed_items${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset) as any[]
    return NextResponse.json(items.map(i => ({ ...i, topic_tags: JSON.parse(i.topic_tags ?? '[]') })))
  }

  // Default: interleaved — pull a large pool sorted by recency, then round-robin by source
  const pool = db.prepare(`SELECT * FROM feed_items${where} ORDER BY published_at DESC LIMIT 400`)
    .all(...params) as any[]

  const parsed = pool.map(i => ({ ...i, topic_tags: JSON.parse(i.topic_tags ?? '[]') }))
  const page_items = interleave(parsed, pageSize, offset)
  return NextResponse.json(page_items)
}
