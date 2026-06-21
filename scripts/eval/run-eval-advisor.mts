// Replays every captured advisor golden set through the real idea-generation
// prompt and scores the output:
// - groundedness: do named trending resources actually appear in the context?
// - actionability: are starter checklists concrete steps, not vague planning?
//
// Usage:
//   npx tsx scripts/eval/run-eval-advisor.mts
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildAndRunTrendingIdeas } from '../../lib/intelligence/advisor'
import { judgeAdvisorGrounded, judgeAdvisorActionability } from '../../lib/eval/judge'
import type { AdvisorGoldenSet } from '../../lib/eval/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GOLDEN_DIR = path.join(__dirname, '../../lib/eval/golden-sets-advisor')

async function main() {
  const files = fs.existsSync(GOLDEN_DIR) ? fs.readdirSync(GOLDEN_DIR).filter(f => f.endsWith('.json')) : []
  if (!files.length) {
    console.error(`No advisor golden sets found in ${GOLDEN_DIR}. Run "npm run eval:advisor:capture" first.`)
    process.exit(1)
  }

  const groundedScores: number[] = []
  const actionabilityScores: number[] = []

  for (const file of files) {
    const goldenSet: AdvisorGoldenSet = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, file), 'utf-8'))
    const ideas = await buildAndRunTrendingIdeas(goldenSet.context)
    const advisorContext = Object.values(goldenSet.context.ctx).join('\n\n')

    console.log(`\n=== ${goldenSet.weekStart} ===`)
    console.log(ideas.map((i: any) => `- ${i.title}`).join('\n'))

    const grounded = await judgeAdvisorGrounded(ideas, advisorContext)
    groundedScores.push(grounded.groundedness)
    console.log(`groundedness: ${grounded.groundedness}/5 — ${grounded.rationale}`)
    if (grounded.unsupported_claims.length) {
      console.log(`  unsupported: ${grounded.unsupported_claims.join(' | ')}`)
    }

    const actionability = await judgeAdvisorActionability(ideas)
    actionabilityScores.push(actionability.actionability)
    console.log(`actionability: ${actionability.actionability}/5 — ${actionability.rationale}`)
    if (actionability.vague_steps.length) {
      console.log(`  vague steps: ${actionability.vague_steps.join(' | ')}`)
    }
  }

  console.log('\n=== Summary ===')
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1)
  console.log(`avg groundedness: ${avg(groundedScores).toFixed(2)}/5 (n=${groundedScores.length})`)
  console.log(`avg actionability: ${avg(actionabilityScores).toFixed(2)}/5 (n=${actionabilityScores.length})`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
