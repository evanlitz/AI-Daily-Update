import { NextResponse } from 'next/server'
import { ensureAllPredictions, getAllPredictions } from '@/lib/intelligence/predictions'
// Deliberately NOT cached, unlike the other read-only GETs. ensureAllPredictions()
// writes — it upserts every row in ALL_SEEDS on each call — so this is a GET with a
// side effect, and caching it would both run those writes at build time and make
// when-seeding-happens depend on cache expiry. It also means every request to this
// route costs 2x|ALL_SEEDS| writes against Turso's rows-written quota; the fix is to
// move seeding into /api/cron/predictions and cache what's left, which changes
// seeding semantics and is a separate call from the rows-read work.
export async function GET() {
  await ensureAllPredictions()
  return NextResponse.json(await getAllPredictions())
}
