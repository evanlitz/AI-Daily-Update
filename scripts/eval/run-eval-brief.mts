// Replays every captured brief golden set through the real buildAndRunBrief
// prompt.
// - groundedness: always scored absolute/reference-free against the source material
// - pairwise: only runs if a baseline output exists for that golden set,
//   comparing baseline (last-approved output) vs this run's candidate output
//
// Usage:
//   npx tsx scripts/eval/run-eval-brief.mts            # score against existing baselines
//   npx tsx scripts/eval/run-eval-brief.mts --promote   # also save candidate as the new baseline
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildAndRunBrief } from '../../lib/intelligence/brief'
import type { BriefSections } from '../../lib/intelligence/brief'
import { judgePairwise, judgeGroundedness } from '../../lib/eval/judge'
import type { BriefGoldenSet, BriefBaseline } from '../../lib/eval/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GOLDEN_DIR   = path.join(__dirname, '../../lib/eval/golden-sets-brief')
const BASELINE_DIR = path.join(__dirname, '../../lib/eval/baselines-brief')

function flatten(brief: BriefSections): string {
  return `SIGNAL: ${brief.signal}\n\nRISING: ${brief.rising}\n\nWATCH: ${brief.watch}\n\nSHIFT: ${brief.shift}`
}

async function main() {
  const promote = process.argv.includes('--promote')
  const files = fs.existsSync(GOLDEN_DIR) ? fs.readdirSync(GOLDEN_DIR).filter(f => f.endsWith('.json')) : []
  if (!files.length) {
    console.error(`No brief golden sets found in ${GOLDEN_DIR}. Run "npx tsx scripts/eval/export-flagged.mts" to grow this from real flagged cases.`)
    process.exit(1)
  }
  fs.mkdirSync(BASELINE_DIR, { recursive: true })

  const groundedScores: number[] = []
  const overallWins = { candidate: 0, baseline: 0, tie: 0 }

  for (const file of files) {
    const goldenSet: BriefGoldenSet = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, file), 'utf-8'))
    const result = await buildAndRunBrief(goldenSet.context)

    console.log(`\n=== ${goldenSet.date} ===`)

    if (!result) {
      console.log('buildAndRunBrief returned null (insufficient data in this fixture) — skipping')
      continue
    }
    const { brief: candidate, sourceMaterial } = result
    const candidateText = flatten(candidate)

    const grounded = await judgeGroundedness(candidateText, sourceMaterial, 'daily brief')
    groundedScores.push(grounded.groundedness)
    console.log(`groundedness: ${grounded.groundedness}/5 — ${grounded.rationale}`)
    if (grounded.unsupported_claims.length) {
      console.log(`  unsupported claims: ${grounded.unsupported_claims.join(' | ')}`)
    }

    const baselinePath = path.join(BASELINE_DIR, file)
    if (fs.existsSync(baselinePath)) {
      const baseline: BriefBaseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'))
      const verdict = await judgePairwise(flatten(baseline.brief), candidateText)
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
      const baseline: BriefBaseline = { date: goldenSet.date, brief: candidate, promotedAt: new Date().toISOString() }
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
