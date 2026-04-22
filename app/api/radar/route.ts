import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET() {
  const { rows } = await db.execute(`SELECT * FROM tech_radar ORDER BY name ASC`)
  const grouped: Record<string, any[]> = { adopt: [], trial: [], assess: [], hold: [] }
  for (const item of rows as any[]) {
    if (grouped[item.quadrant]) grouped[item.quadrant].push(item)
  }
  return NextResponse.json({ grouped, total: rows.length })
}
