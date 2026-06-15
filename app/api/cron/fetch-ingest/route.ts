import { fetchIngest } from '@/lib/pipeline'

export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const count = await fetchIngest()
  return Response.json({ ok: true, rawInserted: count })
}
