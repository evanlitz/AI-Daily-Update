import { updateBenchmarks } from '@/lib/intelligence/benchmarks'

export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const result = await updateBenchmarks()
    return Response.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/benchmarks] failed:', err)
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
