import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const { category, source, type } = body ?? {}
  if (!category || !source) return NextResponse.json({ ok: false }, { status: 400 })

  const readInc = type === 'open' ? 0 : 1
  const openInc = type === 'open' ? 1 : 0
  const now = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO user_affinity (category, source, read_count, open_count, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(category, source) DO UPDATE SET
            read_count = read_count + ?,
            open_count = open_count + ?,
            updated_at = excluded.updated_at`,
    args: [category, source, readInc, openInc, now, readInc, openInc],
  })

  return NextResponse.json({ ok: true })
}
