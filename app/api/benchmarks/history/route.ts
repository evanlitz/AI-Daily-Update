import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const metric = searchParams.get('metric') ?? 'swe_bench'

  // Historical synced snapshots
  const { rows: snaps } = await db.execute({
    sql: `SELECT bs.model_slug, bs.value, bs.fetched_at, am.name, am.lab
          FROM benchmark_snapshots bs
          JOIN ai_models am ON am.slug = bs.model_slug
          WHERE bs.metric = ?
          ORDER BY bs.fetched_at ASC`,
    args: [metric],
  })

  // Current static values as a baseline for models with no snapshots yet
  const { rows: models } = await db.execute(
    `SELECT slug, name, lab, benchmarks, updated_at FROM ai_models WHERE status != 'deprecated'`
  )

  const snapshotSlugs = new Set((snaps as any[]).map(r => r.model_slug as string))
  const map: Record<string, { name: string; lab: string; values: { date: string; value: number }[] }> = {}

  for (const r of snaps as any[]) {
    if (!map[r.model_slug]) map[r.model_slug] = { name: r.name, lab: r.lab, values: [] }
    map[r.model_slug].values.push({ date: r.fetched_at, value: Number(r.value) })
  }

  for (const r of models as any[]) {
    if (snapshotSlugs.has(r.slug)) continue
    let benches: Record<string, number> = {}
    try { benches = JSON.parse(r.benchmarks ?? '{}') } catch {}
    const val = benches[metric]
    if (val === undefined) continue
    map[r.slug] = { name: r.name, lab: r.lab, values: [{ date: r.updated_at, value: Number(val) }] }
  }

  const out = Object.entries(map)
    .filter(([, d]) => d.values.length > 0)
    .map(([slug, d]) => ({ slug, ...d }))
    .sort((a, b) => (b.values.at(-1)?.value ?? 0) - (a.values.at(-1)?.value ?? 0))

  return NextResponse.json(out)
}
