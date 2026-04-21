export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { fetchAll, startCron } = await import('./lib/pipeline')
    await fetchAll()
    // Skip node-cron on Vercel — serverless processes don't persist.
    // Vercel Cron (vercel.json) calls /api/cron/fetch instead.
    if (!process.env.VERCEL) startCron()
  }
}
