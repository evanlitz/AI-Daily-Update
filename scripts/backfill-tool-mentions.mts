// One-off backfill: `mentions` edges (feed_item -> tech_radar) only ever get
// written for that pipeline cycle's newItems (see saveToolMentions in
// lib/intelligence/radar.ts), so every feed_item screened before graph_edges
// existed has zero mention edges. This reuses the same TOOL_PATTERNS regex +
// normalizeKey matching classifyForRadar()/saveToolMentions() already use,
// just run once across the full screened history instead of one cycle's batch.
// Idempotent — addEdge() is an upsert, safe to re-run.
//
// Usage: node --env-file=.env.local --import tsx scripts/backfill-tool-mentions.mts [--dry-run]
import db from '../lib/db'
import { addEdge } from '../lib/graph'
import { normalizeKey, TOOL_PATTERNS } from '../lib/intelligence/radar'

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const { rows: radarRows } = await db.execute(`SELECT id, name FROM tech_radar`)
  const nameToId = new Map<string, string>()
  for (const row of radarRows as any[]) nameToId.set(normalizeKey(row.name as string), row.id as string)
  console.log(`[backfill] ${nameToId.size} radar tools loaded`)

  const { rows: items } = await db.execute(`SELECT id, title, raw_content FROM feed_items WHERE screened = 1`)
  console.log(`[backfill] scanning ${items.length} screened feed_items${DRY_RUN ? ' (dry run)' : ''}`)

  let scanned = 0, linked = 0
  const sample: string[] = []

  for (const item of items as any[]) {
    scanned++
    const text = `${item.title} ${item.raw_content ?? ''}`
    const matches = text.match(TOOL_PATTERNS) ?? []
    if (!matches.length) continue

    const seenKeys = new Set<string>()
    for (const m of matches) {
      const key = normalizeKey(m)
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      const radarId = nameToId.get(key)
      if (!radarId) continue

      if (!DRY_RUN) {
        await addEdge('feed_item', item.id, 'tech_radar', radarId, 'mentions', { weight: 1 })
      }
      linked++
      if (sample.length < 10) sample.push(`${item.title.slice(0, 60)} -> ${m}`)
    }

    if (scanned % 500 === 0) console.log(`[backfill] ${scanned}/${items.length} scanned, ${linked} edges so far`)
  }

  console.log(`[backfill] done. ${scanned} items scanned, ${linked} mention edges ${DRY_RUN ? 'would be' : ''} written`)
  if (sample.length) {
    console.log('[backfill] sample matches:')
    sample.forEach(s => console.log(`  ${s}`))
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
