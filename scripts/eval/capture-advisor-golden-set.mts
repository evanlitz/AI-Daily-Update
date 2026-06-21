// Snapshots the current live TrendingAdvisorContext to a frozen JSON fixture.
// Run periodically to grow the golden set: npm run eval:advisor:capture
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { fetchTrendingAdvisorContext } from '../../lib/intelligence/advisor'
import { getMondayISO } from '../../lib/utils'
import type { AdvisorGoldenSet } from '../../lib/eval/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const weekStart = getMondayISO()
  const context = await fetchTrendingAdvisorContext()

  const goldenSet: AdvisorGoldenSet = {
    id: crypto.randomUUID(),
    weekStart,
    capturedAt: new Date().toISOString(),
    context,
  }

  const dir = path.join(__dirname, '../../lib/eval/golden-sets-advisor')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${weekStart}.json`)
  fs.writeFileSync(file, JSON.stringify(goldenSet, null, 2))

  console.log(`Captured advisor golden set: ${file}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
