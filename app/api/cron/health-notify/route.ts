import { runHealthChecks } from '@/lib/health'
import { sendAlert } from '@/lib/notify'
import db from '@/lib/db'

export const maxDuration = 30

async function pruneCronRuns(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600_000).toISOString()
  await db.execute({ sql: `DELETE FROM cron_runs WHERE started_at < ?`, args: [cutoff] })
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    await pruneCronRuns().catch(err => console.error('[health-notify] prune failed:', err))
    const failures = await runHealthChecks()

    if (failures.length === 0) {
      console.log('[health-notify] all checks passed')
      return Response.json({ ok: true, failures: 0 })
    }

    console.error(`[health-notify] ${failures.length} check(s) failed:`, failures.map(f => f.check))
    await sendAlert(failures)
    return Response.json({ ok: true, failures: failures.length, checks: failures.map(f => f.check) })
  } catch (err) {
    console.error('[health-notify] failed:', err)
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
