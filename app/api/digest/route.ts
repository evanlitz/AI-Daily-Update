import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET() {
  const { rows } = await db.execute(`SELECT * FROM weekly_digest ORDER BY created_at DESC LIMIT 1`)
  const digest = rows[0] as any
  if (!digest) return NextResponse.json(null)
  return NextResponse.json({
    ...digest,
    highlights: JSON.parse(digest.highlights ?? '[]'),
    changes:    JSON.parse(digest.changes    ?? '[]'),
  })
}
