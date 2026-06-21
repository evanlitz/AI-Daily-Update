// Snapshots the current live PredictionContext to a frozen JSON fixture.
// Run periodically to grow the golden set: npm run eval:prediction:capture
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { fetchPredictionContext } from '../../lib/intelligence/predictions'
import type { PredictionGoldenSet } from '../../lib/eval/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const context = await fetchPredictionContext()

  const goldenSet: PredictionGoldenSet = {
    id: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
    context,
  }

  const dir = path.join(__dirname, '../../lib/eval/golden-sets-prediction')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${goldenSet.capturedAt.slice(0, 10)}.json`)
  fs.writeFileSync(file, JSON.stringify(goldenSet, null, 2))

  console.log(`Captured prediction golden set: ${file} (${context.feedItems.length} feed items, ${context.predictions.length} predictions)`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
