import { revalidatePath } from 'next/cache'

// Every DB-reading page and route used to be `force-dynamic`, so a render happened
// per request — including every crawler and uptime ping. Turso bills rows read, and
// the heavy readers (app/api/graph reads three tables in full, the feed pages sort
// all of feed_items) made that the dominant cost of a 150-200M rows/day burn.
//
// Content here only changes when a cron writes: ingest at 08:00/20:00 UTC, intel at
// :20 and :45, digest at 09:00, predictions weekly, benchmarks on the 1st/11th/21st.
// So the correct shape is cached-with-explicit-invalidation, not always-dynamic:
// REVALIDATE_SECONDS is a safety net for anything that writes outside a cron, and
// invalidateContentRoutes() is what actually keeps the site fresh — the crons call
// it when they finish, so a visitor sees new content within one request of ingest
// rather than waiting out the window.
//
// Note this is the pre-Cache-Components model (`export const revalidate`,
// revalidatePath). Next 16 still supports it because `cacheComponents` is not
// enabled in next.config.ts; if that flag is ever turned on, both of those are
// removed and this needs to become `use cache` + cacheLife/cacheTag.
export const REVALIDATE_SECONDS = 900

// Paths whose content is derived from what the pipeline writes. A path only belongs
// here if it reads the DB and declares `export const revalidate` — adding one that
// is still dynamic is harmless but pointless, and omitting one that is cached means
// it stays stale until its own window expires.
// Only routes that take no per-request input are listed. /api/entities, /api/feed,
// /api/models, /api/datasets and /api/repos all read searchParams, so Next keeps
// them dynamic and there is no cache entry for revalidatePath to purge — listing
// them here would look like coverage while doing nothing. Their row cost is
// bounded by query shape instead (see the CTE in app/api/entities/route.ts).
const CONTENT_PATHS = [
  '/',
  '/feed',
  '/embed',
  '/advisor',
  '/api/graph',
  '/api/stories',
] as const

// Verified against `next build` output: /, /advisor, /embed, /feed, /api/graph and
// /api/stories report a 15m revalidate; everything else is still `ƒ` dynamic.
// /api/radar declares `revalidate` but stays dynamic because a DELETE handler lives
// in the same file (confirmed by building with DELETE removed — it becomes static).
// Splitting DELETE into its own route would cache it, but tech_radar is a handful of
// rows, so it isn't worth changing the client's API surface for.

// Guard for a GET handler that declares `revalidate`. Those are evaluated at build
// time, not per request, so an unhandled DB error fails `next build` and blocks the
// deploy — hence a fallback. But the fallback is scoped to the build ONLY, and that
// distinction is the whole point of this function.
//
// At runtime, a caught error is actively worse than an uncaught one. Next's ISR
// already handles a failed regeneration correctly: response-cache/index.js re-sets
// the PREVIOUS good entry with a clamped 3-30s revalidate, so visitors keep seeing
// the last good page and the DB is retried within seconds. Catching converts that
// failure into a reported success, so the empty payload is written as the new cache
// entry and pinned for the full 900s window — one transient Turso stall would blank
// the homepage, /api/graph and /api/stories for 15 minutes, replacing content that
// was good a second earlier. Letting it throw is strictly better on both counts.
const IS_BUILD = process.env.NEXT_PHASE === 'phase-production-build'

export async function withCachedFallback<T>(label: string, produce: () => Promise<T>, fallback: T): Promise<T> {
  if (!IS_BUILD) return produce()
  try {
    return await produce()
  } catch (err) {
    console.error(`[cache] ${label} failed during build, prerendering empty payload:`, err)
    return fallback
  }
}

// The invariant: EVERY write to a table read by a CONTENT_PATHS route must call
// this. Crons are not the only writers — getting that wrong is what made the
// stories "Update" button appear to do nothing, because app/stories/page.tsx POSTs
// /api/stories/generate and then immediately refetches the now-cached /api/stories,
// receiving the pre-generation list. Current callers:
//   - lib/cronRuns.ts (every /api/cron/fetch-* route), cron/digest, cron/predictions,
//     lib/intelligence/brief.ts
//   - app/api/stories/generate, stories/[id] PATCH+DELETE, stories/[id]/resolve,
//     stories/[id]/events
//   - app/api/advisor, advisor/custom, advisor/refine  (write project_ideas, which
//     /advisor and /embed prerender)
//
// Deliberately never throws: a failed cache purge means stale content for up to
// REVALIDATE_SECONDS, which must not turn a successful ingest into a failed
// cron run (lib/cronRuns.ts would record it as a failure and alert on it).
export function invalidateContentRoutes(): void {
  for (const path of CONTENT_PATHS) {
    try {
      revalidatePath(path)
    } catch (err) {
      console.error(`[cache] revalidatePath(${path}) failed:`, err)
    }
  }
}
