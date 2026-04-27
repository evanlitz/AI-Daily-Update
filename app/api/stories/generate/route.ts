import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { updateStoryThreads } from '@/lib/intelligence/stories'

export async function POST() {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { rows } = await db.execute({
      sql: `SELECT id, title, summary, velocity_score FROM feed_items WHERE fetched_at >= ? ORDER BY velocity_score DESC LIMIT 100`,
      args: [weekAgo],
    })
    await updateStoryThreads(rows as any[])
    const { rows: threads } = await db.execute(
      `SELECT COUNT(*) as c FROM story_threads WHERE status = 'active'`
    )
    return NextResponse.json({ ok: true, active: (threads[0] as any).c })
  } catch (err) {
    console.error('[stories/generate]', err)
    return NextResponse.json({ error: 'Failed to update stories' }, { status: 500 })
  }
}
