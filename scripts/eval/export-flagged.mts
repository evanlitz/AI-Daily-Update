// Reviews eval_scores rows the live groundedness judge flagged (see
// lib/eval/live-check.ts) and, for each one, writes a real golden-set fixture
// file into lib/eval/golden-sets(-brief)/ — the same format the manual capture
// scripts produce — then marks the row exported so it stops showing up in the
// health-notify alert.
//
// This is the one manual step in the whole loop, deliberately: read the
// rationale/unsupported_claims for each flagged case before deciding it's a
// real, worth-keeping regression test. Nothing here ever touches a prompt.
//
// Usage:
//   npx tsx scripts/eval/export-flagged.mts
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import db from '../../lib/db'
import { safeJSON } from '../../lib/utils'
import type { GoldenSet, BriefGoldenSet } from '../../lib/eval/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIGEST_DIR = path.join(__dirname, '../../lib/eval/golden-sets')
const BRIEF_DIR  = path.join(__dirname, '../../lib/eval/golden-sets-brief')

function uniquePath(dir: string, base: string, targetId: string): string {
  const primary = path.join(dir, `${base}.json`)
  if (!fs.existsSync(primary)) return primary
  return path.join(dir, `${base}-${targetId.slice(0, 8)}.json`)
}

async function main() {
  const { rows } = await db.execute(
    `SELECT id, target_type, target_id, groundedness, unsupported_claims, rationale, context_json, created_at
     FROM eval_scores WHERE flagged = 1 AND exported = 0
     ORDER BY created_at ASC`
  )

  if (!rows.length) {
    console.log('No flagged cases waiting for review.')
    return
  }

  console.log(`${rows.length} flagged case(s) to review:\n`)

  for (const row of rows as any[]) {
    const unsupported = safeJSON<string[]>(row.unsupported_claims ?? '[]', [])
    console.log(`--- ${row.target_type} ${row.target_id} (${row.created_at}) ---`)
    console.log(`groundedness: ${row.groundedness}/5`)
    console.log(`rationale: ${row.rationale}`)
    if (unsupported.length) console.log(`unsupported claims: ${unsupported.join(' | ')}`)

    const payload = safeJSON<any>(row.context_json ?? '{}', null)
    if (!payload) {
      console.log('(no context snapshot — skipping export for this row)\n')
      continue
    }

    if (row.target_type === 'digest') {
      const { weekStart, context } = payload
      const goldenSet: GoldenSet = { id: crypto.randomUUID(), weekStart, capturedAt: new Date().toISOString(), context }
      fs.mkdirSync(DIGEST_DIR, { recursive: true })
      const file = uniquePath(DIGEST_DIR, weekStart, row.target_id)
      fs.writeFileSync(file, JSON.stringify(goldenSet, null, 2))
      console.log(`exported -> ${file}\n`)
    } else if (row.target_type === 'brief') {
      const { date, context } = payload
      const goldenSet: BriefGoldenSet = { id: crypto.randomUUID(), date, capturedAt: new Date().toISOString(), context }
      fs.mkdirSync(BRIEF_DIR, { recursive: true })
      const file = uniquePath(BRIEF_DIR, date, row.target_id)
      fs.writeFileSync(file, JSON.stringify(goldenSet, null, 2))
      console.log(`exported -> ${file}\n`)
    } else {
      console.log(`(unknown target_type "${row.target_type}" — skipping)\n`)
      continue
    }

    await db.execute({ sql: `UPDATE eval_scores SET exported = 1 WHERE id = ?`, args: [row.id] })
  }

  console.log('Done. Re-run health-notify locally to confirm the alert clears.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
