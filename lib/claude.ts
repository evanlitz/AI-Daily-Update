import Anthropic from '@anthropic-ai/sdk'

// The SDK's own default timeout is 600s — longer than every cron route's
// maxDuration=300, so it could never actually fire before Vercel's platform-level
// kill (which skips our try/catch entirely and leaves cron_runs stuck 'running',
// same failure shape lib/memory.ts's embed() had before its own timeout fix).
// 60s bounds a single call well under the route budget; hooks.ts's screening loop
// makes several of these sequentially (up to ~7 batches), so this caps each one
// without assuming a whole invocation only ever makes one call.
//
// 60s is right ONLY for short/batched calls (hooks, entities, judge — ≤2800
// output tokens). Long-form Sonnet generations take longer than that to write
// their output: every digest attempt on 2026-07-13/14 (3800 max_tokens) hit
// this default and failed with "Request timed out." after 3 retried attempts.
// Any call that can emit more than ~3000 tokens must pass its own per-request
// override — anthropic.messages.create(params, { timeout, maxRetries }) — sized
// to its route's maxDuration (see digest.ts, stories.ts, predictions.ts).
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 60_000,
})

export const MODEL = 'claude-sonnet-4-6'
export const MODEL_FAST = 'claude-haiku-4-5-20251001'
