import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET() {
  const items = db.prepare(`SELECT * FROM tech_radar ORDER BY name ASC`).all() as any[]
  const grouped: Record<string, any[]> = { adopt: [], trial: [], assess: [], hold: [] }
  for (const item of items) {
    if (grouped[item.quadrant]) grouped[item.quadrant].push(item)
  }
  return NextResponse.json({ grouped, total: items.length })
}
