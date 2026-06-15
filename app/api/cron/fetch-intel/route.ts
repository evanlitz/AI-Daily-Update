import { fetchIntelligence } from '@/lib/pipeline'

export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  await fetchIntelligence()
  return Response.json({ ok: true })
}
