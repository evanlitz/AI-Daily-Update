import { fetchIngest } from '@/lib/pipeline'
import { runCronJob } from '@/lib/cronRuns'

export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  return runCronJob('/api/cron/fetch-ingest', async () => {
    const count = await fetchIngest()
    return { rawInserted: count }
  })
}
