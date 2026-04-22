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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const tags = searchParams.get('tags')
  const sort = searchParams.get('sort')
  const pageSize = 40
  const offset = (page - 1) * pageSize

  let where = ''
  const args: any[] = []
  if (tags) {
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
    if (tagList.length > 0) {
      where = ` WHERE (${tagList.map(() => `topic_tags LIKE ?`).join(' OR ')})`
      args.push(...tagList.map(t => `%"${t}"%`))
    }
  }

  if (sort === 'velocity') {
    const { rows } = await db.execute({ sql: `SELECT * FROM feed_items${where} ORDER BY velocity_score DESC LIMIT ? OFFSET ?`, args: [...args, pageSize, offset] })
    return NextResponse.json(rows.map((i: any) => ({ ...i, topic_tags: JSON.parse(i.topic_tags ?? '[]') })))
  }
  if (sort === 'recent') {
    const { rows } = await db.execute({ sql: `SELECT * FROM feed_items${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`, args: [...args, pageSize, offset] })
    return NextResponse.json(rows.map((i: any) => ({ ...i, topic_tags: JSON.parse(i.topic_tags ?? '[]') })))
  }
  const { rows: pool } = await db.execute({ sql: `SELECT * FROM feed_items${where} ORDER BY published_at DESC LIMIT 400`, args })
  const parsed = pool.map((i: any) => ({ ...i, topic_tags: JSON.parse(i.topic_tags ?? '[]') }))
  return NextResponse.json(interleave(parsed, pageSize, offset))
}
