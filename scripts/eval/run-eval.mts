// Replays every captured golden set through the real digest prompt.
// - groundedness: always scored absolute/reference-free against the source material
// - pairwise (specificity + insightfulness): only runs if a baseline output
//   exists for that golden set, comparing baseline (last-approved output) vs
//   this run's candidate output
//
// Usage:
//   npx tsx scripts/eval/run-eval.ts            # score against existing baselines
//   npx tsx scripts/eval/run-eval.ts --promote   # also save candidate as the new baseline
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildAndRunDigest } from '../../lib/intelligence/digest'
import { judgePairwise, judgeGroundedness } from '../../lib/eval/judge'
import type { GoldenSet, Baseline } from '../../lib/eval/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GOLDEN_DIR   = path.join(__dirname, '../../lib/eval/golden-sets')
const BASELINE_DIR = path.join(__dirname, '../../lib/eval/baselines')

async function main() {
  const promote = process.argv.includes('--promote')
  const files = fs.existsSync(GOLDEN_DIR) ? fs.readdirSync(GOLDEN_DIR).filter(f => f.endsWith('.json')) : []
  if (!files.length) {
    console.error(`No golden sets found in ${GOLDEN_DIR}. Run "npm run eval:capture" first.`)
    process.exit(1)
  }
  fs.mkdirSync(BASELINE_DIR, { recursive: true })

  const groundedScores: number[] = []
  const overallWins = { candidate: 0, baseline: 0, tie: 0 }

  for (const file of files) {
    const goldenSet: GoldenSet = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, file), 'utf-8'))
    // sourceMaterial is exactly what fed the digest (top ~25 clusters) — checking
    // groundedness against this instead of all 200 raw items is both cheaper and
    // more correct, since items that never made the cut aren't relevant to "did
    // the digest invent something not in its own source material."
    const { content: candidate, sourceMaterial: sourceContext } = await buildAndRunDigest(goldenSet.context, goldenSet.weekStart)

    console.log(`\n=== ${goldenSet.weekStart} ===`)

    const grounded = await judgeGroundedness(candidate, sourceContext)
    groundedScores.push(grounded.groundedness)
    console.log(`groundedness: ${grounded.groundedness}/5 — ${grounded.rationale}`)
    if (grounded.unsupported_claims.length) {
      console.log(`  unsupported claims: ${grounded.unsupported_claims.join(' | ')}`)
    }

    const baselinePath = path.join(BASELINE_DIR, file)
    if (fs.existsSync(baselinePath)) {
      const baseline: Baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'))
      const verdict = await judgePairwise(baseline.content, candidate)
      const resolve = (label: 'A' | 'B' | 'tie') =>
        label === 'tie' ? 'tie' : label === verdict.baselineLabel ? 'baseline' : 'candidate'
      console.log(`specificity: ${resolve(verdict.specificity.winner)} wins — ${verdict.specificity.reason}`)
      console.log(`insightfulness: ${resolve(verdict.insightfulness.winner)} wins — ${verdict.insightfulness.reason}`)
      const overall = resolve(verdict.overall_winner)
      console.log(`overall: ${overall} wins`)
      overallWins[overall]++
    } else {
      console.log('no baseline yet for this golden set — skipping pairwise (run with --promote to set one)')
    }

    if (promote) {
      const baseline: Baseline = { weekStart: goldenSet.weekStart, content: candidate, promotedAt: new Date().toISOString() }
      fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2))
    }
  }

  console.log('\n=== Summary ===')
  const avgGrounded = groundedScores.reduce((a, b) => a + b, 0) / (groundedScores.length || 1)
  console.log(`avg groundedness: ${avgGrounded.toFixed(2)}/5 (n=${groundedScores.length})`)
  console.log(`pairwise overall: candidate ${overallWins.candidate} / baseline ${overallWins.baseline} / tie ${overallWins.tie}`)
  if (promote) console.log('baselines updated to this run\'s outputs')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
