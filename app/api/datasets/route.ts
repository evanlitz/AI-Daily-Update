import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const task  = searchParams.get('task')
  const sort  = searchParams.get('sort') ?? 'likes'
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '60'))

  let sql = `SELECT * FROM datasets`
  const args: any[] = []
  if (task && task !== 'all') { sql += ` WHERE task_categories LIKE ?`; args.push(`%"${task}"%`) }
  sql += sort === 'recent' ? ` ORDER BY last_modified DESC` : ` ORDER BY likes DESC`
  sql += ` LIMIT ?`; args.push(limit)

  const { rows } = await db.execute({ sql, args })
  return NextResponse.json(rows.map((r: any) => ({
    ...r,
    task_categories: JSON.parse(r.task_categories ?? '[]'),
    modalities: JSON.parse(r.modalities ?? '[]'),
  })))
}
