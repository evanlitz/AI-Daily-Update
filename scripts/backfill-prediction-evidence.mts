// One-off backfill: `evidence_for` edges (prediction -> story_thread) only get
// written going forward by applyStoryEvidence(). But ai_predictions.evidence
// already holds historical, already-judged thread links from before graph_edges
// existed — each entry with source === 'story_thread' was pushed by
// applyStoryEvidence() itself, title-prefixed as "[<threadTitle>] <eventText>".
// This parses that prefix, matches it back to story_threads.title, and writes
// the edge directly — no LLM re-matching, just reading data that already exists.
// Entries whose thread has since been deleted/renamed won't match and are
// skipped (logged), not treated as an error.
// Idempotent — addEdge() is an upsert, safe to re-run.
//
// Usage: node --env-file=.env.local --import tsx scripts/backfill-prediction-evidence.mts [--dry-run]
import db from '../lib/db'
import { addEdge } from '../lib/graph'
import { safeJSON } from '../lib/utils'
import type { EvidenceLink } from '../lib/types'

const DRY_RUN = process.argv.includes('--dry-run')
const PREFIX_RE = /^\[(.+?)\]\s*([\s\S]*)$/

async function main() {
  const { rows: threadRows } = await db.execute(`SELECT id, title FROM story_threads`)
  const titleToId = new Map<string, string>()
  for (const row of threadRows as any[]) titleToId.set(row.title as string, row.id as string)
  console.log(`[backfill] ${titleToId.size} story threads loaded`)

  const { rows: predRows } = await db.execute(`SELECT id, evidence FROM ai_predictions WHERE evidence IS NOT NULL AND evidence != '[]' AND evidence != ''`)
  console.log(`[backfill] ${predRows.length} predictions with evidence data${DRY_RUN ? ' (dry run)' : ''}`)

  let linked = 0, skippedNoMatch = 0
  const unmatched: string[] = []

  for (const pred of predRows as any[]) {
    const evidence = safeJSON<EvidenceLink[]>(pred.evidence, [])
    for (const e of evidence) {
      if (e.source !== 'story_thread') continue
      const m = e.title.match(PREFIX_RE)
      if (!m) continue
      const [, threadTitle, eventText] = m
      const threadId = titleToId.get(threadTitle)
      if (!threadId) {
        skippedNoMatch++
        if (unmatched.length < 10) unmatched.push(threadTitle)
        continue
      }

      if (!DRY_RUN) {
        await addEdge('prediction', pred.id, 'story_thread', threadId, 'evidence_for', {
          weight: 0.7, // nudge info wasn't preserved in the blob — use the non-nudge default
          label: eventText.slice(0, 150),
        })
      }
      linked++
    }
  }

  console.log(`[backfill] done. ${linked} evidence_for edges ${DRY_RUN ? 'would be' : ''} written, ${skippedNoMatch} skipped (thread not found — deleted or renamed)`)
  if (unmatched.length) {
    console.log('[backfill] sample unmatched thread titles:')
    unmatched.forEach(t => console.log(`  ${t}`))
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
