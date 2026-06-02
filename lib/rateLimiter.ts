// Per-key in-memory cooldown. Resets on cold start — imperfect but sufficient
// to prevent rapid repeated calls from draining the Anthropic API key.
const lastCall = new Map<string, number>()

export function checkCooldown(key: string, minMs: number): { ok: boolean; retryAfterMs: number } {
  const last = lastCall.get(key) ?? 0
  const elapsed = Date.now() - last
  if (elapsed < minMs) {
    return { ok: false, retryAfterMs: minMs - elapsed }
  }
  lastCall.set(key, Date.now())
  return { ok: true, retryAfterMs: 0 }
}
