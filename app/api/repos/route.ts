import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lang  = searchParams.get('lang')
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '25'))
  // Always show the most recently fetched batch — repos within 60 min of the
  // latest fetched_at — so the page never goes blank if the cron is late.
  let sql = `
    WITH latest AS (SELECT MAX(fetched_at) AS ts FROM github_repos)
    SELECT gr.* FROM github_repos gr, latest l
    WHERE gr.fetched_at >= datetime(l.ts, '-60 minutes')`
  const args: any[] = []

  if (lang && lang !== 'all') { sql += ` AND LOWER(gr.language) = LOWER(?)`; args.push(lang) }
  sql += ` ORDER BY gr.stars_today DESC LIMIT ?`
  args.push(limit)

  const { rows } = await db.execute({ sql, args })
  return NextResponse.json(rows.map((r: any) => ({ ...r, topics: JSON.parse(r.topics ?? '[]') })))
}
