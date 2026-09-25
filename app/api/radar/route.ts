import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { removeEdgesFor } from '@/lib/graph'
import { withCachedFallback } from '@/lib/cache'

// Must be a literal: Next 16 statically analyses segment config exports and
// rejects an imported constant. Keep in sync with REVALIDATE_SECONDS in lib/cache.ts.
export const revalidate = 900

const EMPTY_RADAR = { grouped: { adopt: [], trial: [], assess: [], hold: [] }, total: 0 }

export async function GET() {
  const payload = await withCachedFallback('GET /api/radar', async () => {
    const { rows } = await db.execute(`SELECT * FROM tech_radar ORDER BY name ASC`)
    const grouped: Record<string, any[]> = { adopt: [], trial: [], assess: [], hold: [] }
    for (const item of rows as any[]) {
      const parsed = {
        ...item,
        ring_history: (() => { try { return JSON.parse(item.ring_history ?? '[]') } catch { return [] } })(),
      }
      if (grouped[item.quadrant]) grouped[item.quadrant].push(parsed)
    }
    return { grouped, total: rows.length }
  }, EMPTY_RADAR)
  return NextResponse.json(payload)
}

export async function DELETE(req: Request) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await db.execute({ sql: `DELETE FROM tech_radar WHERE id = ?`, args: [id] })
  await removeEdgesFor('tech_radar', id)
  return NextResponse.json({ ok: true })
}
