import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lang = searchParams.get('lang')
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '25'))
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  let query = `SELECT * FROM github_repos WHERE fetched_at >= ?`
  const params: any[] = [since]

  if (lang && lang !== 'all') {
    query += ` AND LOWER(language) = LOWER(?)`
    params.push(lang)
  }

  query += ` ORDER BY stars_today DESC LIMIT ?`
  params.push(limit)

  const repos = db.prepare(query).all(...params) as any[]
  const parsed = repos.map(r => ({
    ...r,
    topics: JSON.parse(r.topics ?? '[]'),
  }))
  return NextResponse.json(parsed)
}
