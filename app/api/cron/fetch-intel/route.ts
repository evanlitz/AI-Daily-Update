import { fetchIntelligence } from '@/lib/pipeline'

export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    await fetchIntelligence()
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[cron/fetch-intel] failed:', err)
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
