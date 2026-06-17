import { fetchIngest } from '@/lib/pipeline'

export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const count = await fetchIngest()
    return Response.json({ ok: true, rawInserted: count })
  } catch (err) {
    console.error('[cron/fetch-ingest] failed:', err)
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
