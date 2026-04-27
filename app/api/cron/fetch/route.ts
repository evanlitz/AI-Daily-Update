import { fetchAll } from '@/lib/pipeline'

export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const count = await fetchAll()
  return Response.json({ ok: true, newItems: count })
}
