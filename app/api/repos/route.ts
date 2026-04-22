import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lang  = searchParams.get('lang')
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '25'))
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  let sql  = `SELECT * FROM github_repos WHERE fetched_at >= ?`
  const args: any[] = [since]

  if (lang && lang !== 'all') { sql += ` AND LOWER(language) = LOWER(?)`; args.push(lang) }
  sql += ` ORDER BY stars_today DESC LIMIT ?`
  args.push(limit)

  const { rows } = await db.execute({ sql, args })
  return NextResponse.json(rows.map((r: any) => ({ ...r, topics: JSON.parse(r.topics ?? '[]') })))
}
