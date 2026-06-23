import { NextResponse } from 'next/server'
import { updateBenchmarks } from '@/lib/intelligence/benchmarks'

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  // Require auth only when CRON_SECRET is configured (i.e. production).
  // In local dev (no secret set) the manual sync button on the models page works freely.
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const result = await updateBenchmarks()
    return NextResponse.json(result)
  } catch (e) {
    console.error('[benchmarks] sync error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
