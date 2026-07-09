import Anthropic from '@anthropic-ai/sdk'

// The SDK's own default timeout is 600s — longer than every cron route's
// maxDuration=300, so it could never actually fire before Vercel's platform-level
// kill (which skips our try/catch entirely and leaves cron_runs stuck 'running',
// same failure shape lib/memory.ts's embed() had before its own timeout fix).
// 60s bounds a single call well under the route budget; hooks.ts's screening loop
// makes several of these sequentially (up to ~7 batches), so this caps each one
// without assuming a whole invocation only ever makes one call.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 60_000,
})

export const MODEL = 'claude-sonnet-4-6'
export const MODEL_FAST = 'claude-haiku-4-5-20251001'
