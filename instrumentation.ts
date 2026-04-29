export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && !process.env.VERCEL) {
    const { fetchAll } = await import('./lib/pipeline')
    await fetchAll()
  }
}
