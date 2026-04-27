import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET() {
  const { rows } = await db.execute({
    sql: `SELECT id, name, type, mention_count, first_seen
          FROM entities
          ORDER BY mention_count DESC
          LIMIT 60`,
    args: [],
  })
  return NextResponse.json(rows)
}
