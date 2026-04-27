import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET() {
  const { rows } = await db.execute(`
    SELECT strftime('%Y-%m-%d', published_at) as day, COUNT(*) as count
    FROM feed_items
    WHERE published_at >= datetime('now', '-7 days')
      AND published_at IS NOT NULL
    GROUP BY day
    ORDER BY day ASC
  `)
  const dataMap = new Map((rows as any[]).map(r => [r.day as string, Number(r.count)]))
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const result = Array.from({ length: 7 }, (_, i) => {
    const d   = new Date(Date.now() - (6 - i) * 86400000)
    const iso = d.toISOString().slice(0, 10)
    return { day: iso, label: DAYS[d.getDay()], count: dataMap.get(iso) ?? 0, isToday: i === 6 }
  })
  return NextResponse.json(result)
}
