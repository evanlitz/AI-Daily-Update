import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET() {
  const { rows } = await db.execute(`SELECT * FROM tech_radar ORDER BY name ASC`)
  const grouped: Record<string, any[]> = { adopt: [], trial: [], assess: [], hold: [] }
  for (const item of rows as any[]) {
    const parsed = {
      ...item,
      ring_history: (() => { try { return JSON.parse(item.ring_history ?? '[]') } catch { return [] } })(),
    }
    if (grouped[item.quadrant]) grouped[item.quadrant].push(parsed)
  }
  return NextResponse.json({ grouped, total: rows.length })
}

export async function DELETE(req: Request) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await db.execute({ sql: `DELETE FROM tech_radar WHERE id = ?`, args: [id] })
  return NextResponse.json({ ok: true })
}
