import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  db.prepare(`UPDATE feed_items SET is_read = 1 WHERE id = ?`).run(id)
  return NextResponse.json({ ok: true })
}
