import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.execute({ sql: `UPDATE feed_items SET is_read = 1 WHERE id = ?`, args: [id] })
  return NextResponse.json({ ok: true })
}
