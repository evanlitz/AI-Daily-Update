import crypto from 'crypto'
import db from '../db'
import { judgeGroundedness } from './judge'

// Groundedness score at or below this is treated as a real failure worth
// preserving as a regression-test fixture, not just a low score to log.
const FLAG_THRESHOLD = 3

// Caps how large any single string field can get inside a stored context_json
// snapshot — flagged context can otherwise carry hundreds of untruncated feed
// items (DigestContext.raw) and grow the table unbounded. 2000 chars is well
// above the 200-400 char slices already used when building prompts, so replay
// fidelity is effectively unaffected.
const MAX_STORED_FIELD_LENGTH = 2000

function truncateForStorage(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_STORED_FIELD_LENGTH
      ? value.slice(0, MAX_STORED_FIELD_LENGTH) + '…[truncated]'
      : value
  }
  if (Array.isArray(value)) return value.map(truncateForStorage)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, truncateForStorage(v)]))
  }
  return value
}

// Runs after every real digest/brief generation — never gates or blocks it
// (callers wrap this in after(), fire-and-forget). Vercel's filesystem is
// read-only in production, so a flagged case can't be written out as a golden-set
// JSON file here the way scripts/eval/capture-golden-set.mts does locally;
// instead the input context is snapshotted into this row, and
// scripts/eval/export-flagged.mts (run locally, by hand) turns it into a real
// fixture file later — that step is also the human review checkpoint before
// anything becomes a permanent regression test.
export async function runLiveGroundednessCheck(
  targetType: 'digest' | 'brief',
  targetId: string,
  content: string,
  sourceMaterial: string,
  context: unknown,
): Promise<void> {
  // Cheap operational kill switch — this fires a full-price Sonnet call on
  // every single digest/brief generation with no built-in sampling, unlike
  // the dedup-before-LLM-call pattern used elsewhere (e.g. hooks.ts). Cost is
  // negligible today (~1-2 cents/call, ~$5/year at current cadence), but this
  // lets it be disabled without a code change if that ever stops being true.
  if (process.env.DISABLE_LIVE_EVAL_CHECK === 'true') return

  const contentLabel = targetType === 'brief' ? 'daily brief' : 'weekly news digest'
  const verdict = await judgeGroundedness(content, sourceMaterial, contentLabel)
  // A parse failure means the judge pipeline itself is broken — that's worth
  // surfacing just as much as a genuinely low score, so it's flagged too.
  const flagged = verdict.parseFailed || (verdict.groundedness > 0 && verdict.groundedness <= FLAG_THRESHOLD)

  await db.execute({
    sql: `INSERT INTO eval_scores
            (id, target_type, target_id, groundedness, unsupported_claims, rationale, flagged, exported, context_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    args: [
      crypto.randomUUID(),
      targetType,
      targetId,
      verdict.groundedness,
      JSON.stringify(verdict.unsupported_claims ?? []),
      verdict.rationale ?? '',
      flagged ? 1 : 0,
      flagged ? JSON.stringify(truncateForStorage(context)) : null,
      new Date().toISOString(),
    ],
  })

  if (flagged) {
    const reason = verdict.parseFailed ? ' (judge parse failure)' : ''
    console.log(`[eval] flagged ${targetType} ${targetId} — groundedness ${verdict.groundedness}/5${reason}`)
  }
}
