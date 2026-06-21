// Replays every captured prediction golden set through the real
// refreshPredictionAnalysis prompt and scores groundedness: does the update
// only cite developments actually present in the feed list it was given?
//
// Usage:
//   npx tsx scripts/eval/run-eval-prediction.mts
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildAndRunPredictionRefresh } from '../../lib/intelligence/predictions'
import { judgePredictionGroundedness } from '../../lib/eval/judge'
import type { PredictionGoldenSet } from '../../lib/eval/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GOLDEN_DIR = path.join(__dirname, '../../lib/eval/golden-sets-prediction')

async function main() {
  const files = fs.existsSync(GOLDEN_DIR) ? fs.readdirSync(GOLDEN_DIR).filter(f => f.endsWith('.json')) : []
  if (!files.length) {
    console.error(`No prediction golden sets found in ${GOLDEN_DIR}. Run "npm run eval:prediction:capture" first.`)
    process.exit(1)
  }

  const groundedScores: number[] = []

  for (const file of files) {
    const goldenSet: PredictionGoldenSet = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, file), 'utf-8'))
    const { updated, feedList } = await buildAndRunPredictionRefresh(goldenSet.context)

    console.log(`\n=== ${file} ===`)
    console.log(`${updated.length} predictions updated`)

    if (!updated.length) {
      console.log('nothing updated — skipping groundedness check')
      continue
    }

    const grounded = await judgePredictionGroundedness(updated, feedList)
    groundedScores.push(grounded.groundedness)
    console.log(`groundedness: ${grounded.groundedness}/5 — ${grounded.rationale}`)
    if (grounded.unsupported_claims.length) {
      console.log(`  unsupported claims: ${grounded.unsupported_claims.join(' | ')}`)
    }
  }

  console.log('\n=== Summary ===')
  const avg = groundedScores.reduce((a, b) => a + b, 0) / (groundedScores.length || 1)
  console.log(`avg groundedness: ${avg.toFixed(2)}/5 (n=${groundedScores.length})`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
