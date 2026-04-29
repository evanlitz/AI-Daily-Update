# Pipeline & Data Layer Fixes

Generated: 2026-04-29

---

## Quick Triage — Highest Revision Risk

Before touching anything, audit these three areas first. They are the most likely to already be silently broken in production:

### 1. Fire-and-forget on Vercel (`lib/pipeline.ts:72-86`)
Every intelligence task after `insertItems` is a detached promise. Vercel kills the process once the HTTP response is sent. Stories, entities, radar, hooks — all may be getting terminated before they finish. **Check Vercel function logs for truncated runs or missing story updates.**

### 2. Turso configuration (`lib/db.ts`)
If `TURSO_DATABASE_URL` is not set as a Vercel environment variable, the app throws on startup and nothing works at all. **Verify in Vercel dashboard that `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set.**

### 3. Digest cron timing (`vercel.json` + `app/api/cron/digest/route.ts`)
Digest only runs Monday 9am. One failed Claude call = no digest that week, no retry for 7 days. **Check if any weeks are missing digests in the DB.**

---

## Fix 1 — Fire-and-forget killed by Vercel

**File:** `lib/pipeline.ts`  
**Severity:** High  
**Root cause:** Vercel serverless functions terminate shortly after the HTTP response is returned. All detached `.catch(console.error)` promises (stories, entities, radar, hooks, predictions, relations) are being killed mid-run.

**Current code (lines 72-86):**
```ts
generateHooks().catch(console.error)
refreshModelsFromFeed(allFeedItems).catch(console.error)
classifyForRadar(allFeedItems).catch(console.error)
updateStoryThreads(newItems).catch(console.error)
saveEntityMentions(newItems, entityMap).catch(console.error)
linkThreads().catch(console.error)
backfillPredictionEvidence().catch(console.error)
backfillEntities().catch(console.error)
seedRadarIfEmpty().catch(console.error)
```

**Fix options (pick one):**

### Option A — Await everything, raise `maxDuration`
Convert all fire-and-forget calls to `await` inside `fetchAll()`. Set `maxDuration = 300` on the cron route (Vercel Pro supports up to 300s). Simplest fix, single pipeline.

```ts
// In app/api/cron/fetch/route.ts
export const maxDuration = 300
```

```ts
// In lib/pipeline.ts — fetchAll()
await generateHooks()
await Promise.all([
  refreshModelsFromFeed(allFeedItems),
  classifyForRadar(allFeedItems),
])
if (newItems.length > 0) {
  await Promise.all([
    updateStoryThreads(newItems),
    saveEntityMentions(newItems, entityMap),
  ])
}
await Promise.all([
  linkThreads(),
  backfillPredictionEvidence(),
  backfillEntities(),
  seedRadarIfEmpty(),
])
```

Parallelise where there are no data dependencies to keep total time down.

### Option B — Split into two crons
Keep fetch lean (just `insertItems`, `insertRepos`, `insertDatasets`, `updateVelocityScores`). Add a second cron `/api/cron/process` that runs 15 minutes later to handle all Claude-heavy intelligence tasks. Both stay under 60s.

```json
// vercel.json
{ "path": "/api/cron/fetch",   "schedule": "0 8 * * *"  },
{ "path": "/api/cron/process", "schedule": "15 8 * * *" },
{ "path": "/api/cron/digest",  "schedule": "0 9 * * *"  }
```

Option A is simpler. Option B is safer if the combined run exceeds 300s.

---

## Fix 2 — Remove `startCron()` dead code

**File:** `lib/pipeline.ts:91-97`  
**Severity:** Low (cleanup)  
**Root cause:** `startCron()` uses `node-cron` which requires a persistent process. Vercel is serverless — no persistent process exists. The function is exported but never imported anywhere. The actual production trigger is `vercel.json`.

**Fix:** Delete `startCron()` and the `node-cron` import. Remove `node-cron` from `package.json` if nothing else uses it.

```ts
// Delete this entire block:
import cron from 'node-cron'
// ...
export function startCron(): void {
  cron.schedule('0 */6 * * *', () => { ... })
}
```

---

## Fix 3 — Digest cron: switch to daily with skip guard

**File:** `vercel.json`, `app/api/cron/digest/route.ts`  
**Severity:** Medium  
**Root cause:** Digest cron runs `0 9 * * 1` (Monday only). A Claude timeout or malformed JSON response on that one run means no digest for the entire week. The route already has a skip guard (`SELECT id WHERE week_start = ?`), so running it daily is safe — it only generates once per week.

**Fix:** Change the schedule to daily:
```json
{ "path": "/api/cron/digest", "schedule": "0 9 * * *" }
```

No changes needed to the route handler — the `rows.length > 0` check already prevents regeneration.

---

## Fix 4 — Raise digest `maxDuration`

**File:** `app/api/cron/digest/route.ts`  
**Severity:** Medium  
**Root cause:** `maxDuration = 60`. Claude generating 2800 tokens can take 30-40s. Combined with 4 parallel DB queries, JSON parsing, and DB write, the 60s wall is reachable. When hit, Vercel returns 504 and nothing is written.

**Fix:**
```ts
export const maxDuration = 300
```

Also add basic error handling so a Claude failure logs clearly rather than silently 504ing.

---

## Fix 5 — Serial `insertItems` round trips

**File:** `lib/pipeline.ts:20-30`  
**Severity:** Medium  
**Root cause:** One `db.execute()` per feed item in a `for` loop. With Turso (remote HTTP DB), each call has network latency. 100 items = 100 serial round trips.

**Current:**
```ts
for (const item of items) {
  const result = await db.execute({ sql: `INSERT OR IGNORE INTO feed_items ...`, args: [...] })
  if (result.rowsAffected > 0) newItems.push(item)
}
```

**Fix:** Use `db.batch()` for the inserts, then determine new items by checking which URLs didn't already exist. Libsql's `batch()` sends all statements in a single HTTP request.

```ts
async function insertItems(items: FeedItem[]): Promise<{ count: number; newItems: FeedItem[] }> {
  if (!items.length) return { count: 0, newItems: [] }
  
  // Check which URLs already exist
  const { rows: existing } = await db.execute({
    sql: `SELECT url FROM feed_items WHERE url IN (${items.map(() => '?').join(',')})`,
    args: items.map(i => i.url),
  })
  const existingUrls = new Set((existing as any[]).map(r => r.url))
  const newItems = items.filter(i => !existingUrls.has(i.url))
  
  if (!newItems.length) return { count: 0, newItems: [] }
  
  await db.batch(newItems.map(item => ({
    sql: `INSERT OR IGNORE INTO feed_items (id, source, title, url, summary, raw_content, published_at, fetched_at, topic_tags, velocity_score, is_read, hook) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [item.id, item.source, item.title, item.url, item.summary ?? null, item.raw_content ?? null, item.published_at ?? null, item.fetched_at, JSON.stringify(item.topic_tags), item.velocity_score, item.is_read, item.hook ?? null],
  })))
  
  return { count: newItems.length, newItems }
}
```

---

## Fix 6 — Serial velocity score updates

**File:** `lib/intelligence/velocity.ts:43-47`  
**Severity:** Medium  
**Root cause:** One `UPDATE feed_items SET velocity_score = ?` per item. Potentially hundreds of serial DB writes every run.

**Fix:** Use `db.batch()` for the score updates, same as Fix 5.

```ts
// Replace the per-item loop with:
const updates = items.map(item => {
  const scores = keywords(item.title).map(kw => kwVel[kw] ?? 0).sort((a, b) => b - a).slice(0, 2)
  const vel = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0
  return { id: item.id, vel: Math.round(vel * 100) / 100 }
})

await db.batch(updates.map(({ id, vel }) => ({
  sql: `UPDATE feed_items SET velocity_score = ? WHERE id = ?`,
  args: [vel, id],
})))
await db.execute({ sql: `UPDATE feed_items SET velocity_score = 0 WHERE fetched_at < ?`, args: [cut30] })
```

---

## Fix 7 — Feed item TTL / cleanup

**File:** `lib/pipeline.ts` or a new cron route  
**Severity:** Low-Medium (won't hurt for months, then will)  
**Root cause:** Feed items are never deleted. `velocity_score` is zeroed after 30 days but rows stay forever. At ~50 items/day, after 2 years you have ~36k rows with `raw_content` stored.

**Fix:** Add a cleanup step to `fetchAll()` (or a separate weekly cron) that deletes old low-value items:

```ts
async function pruneOldFeedItems(): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  await db.execute({
    sql: `DELETE FROM feed_items 
          WHERE fetched_at < ? 
            AND id NOT IN (SELECT DISTINCT value FROM story_events, json_each(feed_item_ids))`,
    args: [cutoff],
  })
}
```

The `NOT IN` guard preserves items linked to story events so you don't lose the evidence chain.

---

## Fix 8 — CRON_SECRET guard hardening

**File:** `app/api/cron/fetch/route.ts`, `app/api/cron/digest/route.ts`  
**Severity:** Low  
**Root cause:** If `CRON_SECRET` is an empty string, `authHeader !== 'Bearer '` is exploitable by sending `Authorization: Bearer ` with a trailing space.

**Fix:** Add an explicit env var presence check:

```ts
const secret = process.env.CRON_SECRET
if (!secret || authHeader !== `Bearer ${secret}`) {
  return new Response('Unauthorized', { status: 401 })
}
```

---

## Fix 9 — Remove schedule inconsistency comment

**File:** `lib/pipeline.ts`  
**Severity:** Low (documentation)  
After removing `startCron()` (Fix 2), the `'0 */6 * * *'` comment is gone. Ensure `vercel.json` is the single source of truth for schedule documentation.

---

## Implementation Order

| Priority | Fix | Files touched | Effort |
|---|---|---|---|
| 1 | Fix 1: Fire-and-forget (Option A) | `lib/pipeline.ts`, `app/api/cron/fetch/route.ts` | ~30 min |
| 2 | Fix 3 + Fix 4: Digest daily + timeout | `vercel.json`, `app/api/cron/digest/route.ts` | ~5 min |
| 3 | Fix 5: Batch `insertItems` | `lib/pipeline.ts` | ~20 min |
| 4 | Fix 6: Batch velocity updates | `lib/intelligence/velocity.ts` | ~15 min |
| 5 | Fix 2: Delete `startCron()` | `lib/pipeline.ts` | ~5 min |
| 6 | Fix 8: CRON_SECRET guard | both cron routes | ~5 min |
| 7 | Fix 7: Feed item TTL | `lib/pipeline.ts` | ~15 min |

Total estimated time: ~1.5-2 hours.
