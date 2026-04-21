import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const task = searchParams.get('task')
  const sort = searchParams.get('sort') ?? 'likes'
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '60'))

  let query = `SELECT * FROM datasets`
  const params: any[] = []

  if (task && task !== 'all') {
    query += ` WHERE task_categories LIKE ?`
    params.push(`%"${task}"%`)
  }

  query += sort === 'recent'
    ? ` ORDER BY last_modified DESC`
    : ` ORDER BY likes DESC`

  query += ` LIMIT ?`
  params.push(limit)

  const rows = db.prepare(query).all(...params) as any[]
  const parsed = rows.map(r => ({
    ...r,
    task_categories: JSON.parse(r.task_categories ?? '[]'),
    modalities: JSON.parse(r.modalities ?? '[]'),
  }))

  return NextResponse.json(parsed)
}
