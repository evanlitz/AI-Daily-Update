import { NextResponse } from 'next/server'
import crypto from 'crypto'
import db from '@/lib/db'
import { getMondayISO } from '@/lib/utils'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { update_text, significance = 'medium', event_date, source_url } = body
  if (!update_text?.trim()) return NextResponse.json({ error: 'update_text required' }, { status: 400 })

  const week = getMondayISO(event_date)
  const now = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO story_events (id, thread_id, week, update_text, significance, feed_item_ids, source, source_url, created_at)
          VALUES (?, ?, ?, ?, ?, '[]', 'manual', ?, ?)
          ON CONFLICT(thread_id, week, significance, source) DO UPDATE SET
            update_text = excluded.update_text,
            source_url  = excluded.source_url,
            created_at  = excluded.created_at`,
    args: [crypto.randomUUID(), id, week, update_text.trim(), significance, source_url?.trim() || null, now],
  })
  await db.execute({
    sql: `UPDATE story_threads SET last_updated = ? WHERE id = ?`,
    args: [now, id],
  })
  return NextResponse.json({ ok: true })
}
