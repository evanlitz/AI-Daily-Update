// Manual full-run trigger (ingest + intel in one call). Not used by Vercel cron —
// see /api/cron/fetch-ingest and /api/cron/fetch-intel for the split cron routes.
import { fetchAll } from '@/lib/pipeline'

export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const count = await fetchAll()
  return Response.json({ ok: true, newItems: count })
}
