import crypto from 'crypto'
import db from './db'

export async function startCronRun(path: string): Promise<string> {
  const id = crypto.randomUUID()
  try {
    await db.execute({
      sql: `INSERT INTO cron_runs (id, path, started_at, status) VALUES (?, ?, ?, 'running')`,
      args: [id, path, new Date().toISOString()],
    })
  } catch (err) {
    console.error('[cronRuns] failed to record start:', err)
  }
  return id
}

export async function finishCronRun(id: string, status: 'success' | 'failed', error?: string): Promise<void> {
  try {
    await db.execute({
      sql: `UPDATE cron_runs SET completed_at = ?, status = ?, error_text = ? WHERE id = ?`,
      args: [new Date().toISOString(), status, error ?? null, id],
    })
  } catch (err) {
    console.error('[cronRuns] failed to record finish:', err)
  }
}

// 20s under the routes' maxDuration=300 — enough margin for this function's own
// DB write plus Vercel's response flush before the platform's hard kill, which
// (unlike this race) skips straight past any try/catch and leaves the row stuck
// 'running' forever (see lib/health.ts's stale-running check). A tripped
// deadline is marked 'failed', not 'success' — real work was left incomplete,
// so the run genuinely didn't finish; per-task budgets inside `work` (see
// hooks.ts, youtube_summaries.ts, radar.ts) are what keep this from tripping
// under normal load.
const CRON_BUDGET_MS = 280_000

// Shared wrapper for every /api/cron/fetch-* route: records start/finish in
// cron_runs and guarantees finishCronRun always fires — even if `work` itself
// would have run past the platform's own timeout — by racing it against a
// deadline safely inside maxDuration.
//
// This is a race, not a cancellation: if the deadline wins, `work` itself
// isn't aborted (no AbortController is threaded into the Claude/DB calls
// inside it) — it keeps running in the background until Vercel's own
// maxDuration kill. In the rare case `work` finishes successfully in that
// window, the row stays marked 'failed' even though the run completed. Worth
// revisiting with real cancellation if that turns out to happen often; for
// now the per-task time budgets in `work` (hooks.ts, youtube_summaries.ts,
// radar.ts) are what keep this deadline from tripping under normal load.
export async function runCronJob(
  path: string,
  work: () => Promise<Record<string, unknown> | void>
): Promise<Response> {
  const runId = await startCronRun(path)
  let timer!: ReturnType<typeof setTimeout>
  const timedOut = new Promise<'timeout'>(resolve => {
    timer = setTimeout(() => resolve('timeout'), CRON_BUDGET_MS)
  })
  try {
    const result = await Promise.race([
      work().then(value => ({ kind: 'done' as const, value })),
      timedOut.then(() => ({ kind: 'timeout' as const })),
    ])
    if (result.kind === 'timeout') {
      const msg = `soft-timeout: exceeded ${CRON_BUDGET_MS}ms budget, aborted before platform kill`
      console.error(`[cron ${path}] ${msg}`)
      await finishCronRun(runId, 'failed', msg)
      return Response.json({ ok: false, error: msg }, { status: 500 })
    }
    await finishCronRun(runId, 'success')
    return Response.json({ ok: true, ...(result.value ?? {}) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[cron ${path}] failed:`, err)
    await finishCronRun(runId, 'failed', msg)
    return Response.json({ ok: false, error: msg }, { status: 500 })
  } finally {
    clearTimeout(timer)
  }
}
