// Snapshots the current live DigestContext to a frozen JSON fixture.
// Run weekly (or whenever this week's news is a good/interesting test case)
// to grow the golden set: npx tsx scripts/eval/capture-golden-set.ts
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { fetchDigestContext } from '../../lib/intelligence/digest'
import { getMondayISO } from '../../lib/utils'
import type { GoldenSet } from '../../lib/eval/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const weekStart = getMondayISO()
  const context = await fetchDigestContext(weekStart)

  const goldenSet: GoldenSet = {
    id: crypto.randomUUID(),
    weekStart,
    capturedAt: new Date().toISOString(),
    context,
  }

  const dir = path.join(__dirname, '../../lib/eval/golden-sets')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${weekStart}.json`)
  fs.writeFileSync(file, JSON.stringify(goldenSet, null, 2))

  console.log(`Captured golden set: ${file} (${context.raw.length} feed items)`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
