import db, { batchWithDiagnostics } from './db'
import { fetchArxiv } from './sources/arxiv'
import { fetchHackerNews } from './sources/hackernews'
import { fetchRSS } from './sources/rss'
import { fetchGithubTrending } from './sources/github'
import { fetchGithubTop } from './sources/github_top'
import { fetchHuggingFace } from './sources/huggingface'
import { fetchDatasets } from './sources/datasets'
import { fetchKaggleDatasets } from './sources/kaggle'
import { fetchYoutube } from './sources/youtube'
import { fetchPapersWithCode } from './sources/paperswithcode'
import { fetchSemanticScholar } from './sources/semanticscholar'
import { fetchGithubReleases } from './sources/github_releases'
import { fetchHFModels } from './sources/hf_models'
import type { Dataset, FeedItem, GithubRepo } from './types'
import { sanitizeText } from './utils'
import { updateVelocityScores, updateAccelerationScores } from './intelligence/velocity'
import { classifyForRadar, classifyToolNames, seedRadarIfEmpty, reclassifyStaleTools } from './intelligence/radar'
import { ensureAllModels, refreshModelsFromFeed } from './intelligence/models'
import { screenPendingItems, generateHooks } from './intelligence/hooks'
import { updateStoryThreads, linkThreads } from './intelligence/stories'
import { backfillPredictionEvidence } from './intelligence/predictions'
import { saveEntityMentions, backfillEntities } from './intelligence/entities'
import { generateYoutubeSummaries } from './intelligence/youtube_summaries'
import { embedFeedItems } from './memory'

// Tags a thrown error with which pipeline step it came from, since libsql/Turso
// errors (e.g. "SERVER_ERROR: Server returned HTTP status 400") don't say which
// statement failed on their own.
async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    console.log(`[timing] ${label}: ${Date.now() - start}ms`)
    return result
  } catch (err) {
    console.log(`[timing] ${label}: ${Date.now() - start}ms (failed)`)
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`[${label}] ${msg}`)
  }
}

// Orchestrator-level backstop: every source already sets its own axios/fetch
// timeout, but a future source (or a library timeout that silently fails to
// abort under some network condition) could still hang Promise.all forever.
// This guarantees fetch-sources unblocks within `ms` regardless.
//
// Also guards rejections, not just hangs: `promise` is one entry in the single
// Promise.all() all 13 sources share (see fetchIngest below) — an uncaught
// throw from any one source would otherwise fail that Promise.all and abort
// ingest for every other source in the same run, not just the failing one.
function withTimeout<T>(label: string, promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => {
      console.error(`[pipeline] ${label} exceeded ${ms}ms orchestrator timeout — using empty fallback`)
      resolve(fallback)
    }, ms)
  })
  const guarded = promise.catch(err => {
    console.error(`[pipeline] ${label} failed — using empty fallback:`, err)
    return fallback
  })
  return Promise.race([guarded, timeout]).finally(() => clearTimeout(timer))
}

// Defensive cap: a source returning far more than expected (API quirk, missing
// pagination limit) shouldn't be allowed to flood the dedup check and batch insert.
function cap<T>(label: string, items: T[], max: number): T[] {
  if (items.length <= max) return items
  console.warn(`[pipeline] ${label} returned ${items.length} items, capping to ${max}`)
  return items.slice(0, max)
}

async function insertItems(items: FeedItem[]): Promise<{ count: number; newItems: FeedItem[] }> {
  if (!items.length) return { count: 0, newItems: [] }
  const results = await batchWithDiagnostics(
    items.map(item => ({
      sql: `INSERT OR IGNORE INTO feed_items (id, source, title, url, summary, raw_content, published_at, fetched_at, topic_tags, velocity_score, is_read, hook, screened) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      args: [item.id, item.source, sanitizeText(item.title), item.url, sanitizeText(item.summary) ?? null, sanitizeText(item.raw_content) ?? null, item.published_at ?? null, item.fetched_at, JSON.stringify(item.topic_tags), item.velocity_score, item.is_read, sanitizeText(item.hook) ?? null],
    })),
    i => `${items[i].source}:${items[i].id}`
  )
  const newItems = items.filter((_, i) => results[i].rowsAffected > 0)
  return { count: newItems.length, newItems }
}

async function insertRepos(repos: GithubRepo[]): Promise<void> {
  if (!repos.length) return
  await batchWithDiagnostics(
    repos.map(repo => ({
      sql: `INSERT INTO github_repos (id, name, full_name, url, description, language, stars_total, stars_today, topics, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(url) DO UPDATE SET stars_total=excluded.stars_total, stars_today=excluded.stars_today, fetched_at=excluded.fetched_at`,
      args: [repo.id, sanitizeText(repo.name), sanitizeText(repo.full_name), repo.url, sanitizeText(repo.description) ?? null, repo.language ?? null, repo.stars_total ?? 0, repo.stars_today ?? 0, JSON.stringify(repo.topics), repo.fetched_at],
    })),
    i => repos[i].full_name
  )
}

async function insertDatasets(datasets: Dataset[]): Promise<void> {
  if (!datasets.length) return
  await batchWithDiagnostics(
    datasets.map(d => ({
      sql: `INSERT INTO datasets (id, full_name, url, description, task_categories, modalities, size_category, license, downloads, likes, last_modified, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(full_name) DO UPDATE SET downloads=excluded.downloads, likes=excluded.likes, last_modified=excluded.last_modified, fetched_at=excluded.fetched_at`,
      args: [d.id, sanitizeText(d.full_name), d.url, sanitizeText(d.description) ?? null, JSON.stringify(d.task_categories), JSON.stringify(d.modalities), d.size_category ?? null, d.license ?? null, d.downloads ?? 0, d.likes ?? 0, d.last_modified ?? null, d.fetched_at],
    })),
    i => datasets[i].full_name
  )
}

// Return only items not already present in the DB (by id or url).
// Also deduplicates within the batch itself so two sources returning the
// same paper/story don't both get screened.
async function filterNewItems(items: FeedItem[]): Promise<FeedItem[]> {
  if (!items.length) return []

  // Within-batch dedup: first occurrence wins
  const seenIds = new Set<string>()
  const seenUrls = new Set<string>()
  const deduped: FeedItem[] = []
  for (const item of items) {
    if (seenIds.has(item.id) || seenUrls.has(item.url)) continue
    seenIds.add(item.id)
    seenUrls.add(item.url)
    deduped.push(item)
  }

  // Check against DB in chunks — SQLite param limit is 999; each item uses 2 params
  const CHUNK = 400
  const existingIds = new Set<string>()
  const existingUrls = new Set<string>()

  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK)
    const ids = chunk.map(item => item.id)
    const urls = chunk.map(item => item.url)
    const idPh  = ids.map(() => '?').join(',')
    const urlPh = urls.map(() => '?').join(',')
    const { rows } = await db.execute({
      sql: `SELECT id, url FROM feed_items WHERE id IN (${idPh}) OR url IN (${urlPh})`,
      args: [...ids, ...urls],
    })
    for (const row of rows as any[]) {
      if (row.id)  existingIds.add(row.id as string)
      if (row.url) existingUrls.add(row.url as string)
    }
  }

  return deduped.filter(item => !existingIds.has(item.id) && !existingUrls.has(item.url))
}

async function recordSourceRuns(counts: Map<string, number>): Promise<void> {
  if (!counts.size) return
  const now = new Date().toISOString()
  await db.batch(
    Array.from(counts.entries()).map(([source, item_count]) => ({
      sql: `INSERT OR REPLACE INTO source_runs (source, fetched_at, item_count) VALUES (?, ?, ?)`,
      args: [source, now, item_count],
    }))
  )
}

// Embed newly-inserted raw items immediately at ingest (before screening), so
// the dedup pre-filter in hooks.ts has vectors to compare unscreened candidates
// against. This costs more Voyage calls than the old post-screening-only
// approach, but Voyage is cheap relative to Claude — the point is spending a
// little more here to let hooks.ts skip a lot more Haiku calls on duplicates.
async function embedNewItems(items: FeedItem[]): Promise<void> {
  if (!items.length) return
  const pending = items.map(item => ({
    id: item.id,
    title: item.title,
    text: (item.summary ?? item.raw_content ?? '') as string,
  }))
  await embedFeedItems(pending)
  console.log(`[pipeline] embedded ${pending.length} feed items at ingest`)
}

// Backstop for any rows that somehow ended up without an embedding (e.g. a
// failed Voyage call during ingest) — selects only where embedding IS NULL,
// so this is a no-op once embedNewItems has already run for a row.
async function embedAnyMissing(): Promise<void> {
  const { rows } = await db.execute(
    `SELECT id, title, summary, raw_content FROM feed_items WHERE embedding IS NULL ORDER BY fetched_at DESC LIMIT 200`
  )
  const pending = (rows as any[]).map(r => ({
    id: r.id as string,
    title: r.title as string,
    text: (r.summary ?? r.raw_content ?? '') as string,
  }))
  if (!pending.length) return
  await embedFeedItems(pending)
  console.log(`[pipeline] backfilled ${pending.length} missing feed item embeddings`)
}

// Delete feed items older than 90 days that aren't linked to any story event.
async function pruneOldFeedItems(): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { rowsAffected } = await db.execute({
    sql: `DELETE FROM feed_items
          WHERE fetched_at < ?
            AND id NOT IN (
              SELECT DISTINCT j.value
              FROM story_events se, json_each(se.feed_item_ids) j
            )`,
    args: [cutoff],
  })
  if (rowsAffected > 0) console.log(`[pipeline] pruned ${rowsAffected} old feed items`)
}

// Rolling 7-day window on the rejected-items diagnostic log (lib/db.ts,
// written by lib/intelligence/hooks.ts) — a debugging aid, not an archive.
async function pruneOldRejectedItemsLog(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { rowsAffected } = await db.execute({
    sql: `DELETE FROM rejected_items_log WHERE rejected_at < ?`,
    args: [cutoff],
  })
  if (rowsAffected > 0) console.log(`[pipeline] pruned ${rowsAffected} old rejected-item log entries`)
}

// Phase 1 of the pipeline: fetch all sources and insert raw items (screened = 0).
// No Claude calls — designed to complete within Vercel Hobby's 10s function limit.
export async function fetchIngest(): Promise<number> {
  console.log('[pipeline] starting ingest...')

  const { rows: ytRows } = await step('youtube-known-urls', () => db.execute(
    `SELECT url FROM feed_items WHERE source LIKE 'youtube:%'`
  ))
  const knownYoutubeUrls = new Set((ytRows as any[]).map(r => r.url as string))

  const SOURCE_TIMEOUT_MS = 20000
  const withFallback = <T>(label: string, p: Promise<T[]>) => withTimeout(label, p, SOURCE_TIMEOUT_MS, [] as T[])

  const [arxiv, hn, rss, github, huggingface, githubTop, hfDatasets, kaggleDatasets, pwc, hfModels, youtube, semanticScholar, ghReleases] = await step('fetch-sources', () => Promise.all([
    withFallback('arxiv', fetchArxiv()), withFallback('hackernews', fetchHackerNews()),
    withFallback('rss', fetchRSS()), withFallback('github', fetchGithubTrending()),
    withFallback('huggingface', fetchHuggingFace()), withFallback('github-top', fetchGithubTop()),
    withFallback('hf-datasets', fetchDatasets()), withFallback('kaggle', fetchKaggleDatasets()),
    withFallback('paperswithcode', fetchPapersWithCode()),
    withFallback('hf-models', fetchHFModels()), withFallback('youtube', fetchYoutube(knownYoutubeUrls)),
    withFallback('semanticscholar', fetchSemanticScholar()), withFallback('github-releases', fetchGithubReleases()),
  ]))

  const cappedHfDatasets = cap('hf-datasets', hfDatasets, 300)
  const allDatasets = [...cappedHfDatasets]
  const seenDatasets = new Set(cappedHfDatasets.map(d => d.full_name))
  for (const d of cap('kaggle', kaggleDatasets, 300)) { if (!seenDatasets.has(d.full_name)) { seenDatasets.add(d.full_name); allDatasets.push(d) } }

  const allFeedItems = [...arxiv, ...hn, ...rss, ...github, ...huggingface, ...pwc, ...hfModels, ...youtube, ...semanticScholar, ...ghReleases]

  const sourceCounts = new Map<string, number>()
  for (const item of allFeedItems) {
    sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1)
  }
  sourceCounts.set('github-top', githubTop.length)
  sourceCounts.set('hf-datasets', cappedHfDatasets.length)
  sourceCounts.set('kaggle', kaggleDatasets.length)
  await step('record-source-runs', () => recordSourceRuns(sourceCounts)).catch(console.error)

  const newCandidates = await step('filter-new-items', () => filterNewItems(allFeedItems))
  console.log(`[pipeline] ${newCandidates.length}/${allFeedItems.length} are new — inserting raw`)

  const { count, newItems } = await step('insert-items', () => insertItems(newCandidates))
  await step('insert-repos-and-datasets', () => Promise.all([insertRepos(githubTop), insertDatasets(allDatasets)]))
  await step('embed-new-items', () => embedNewItems(newItems)).catch(console.error)

  console.log(`[pipeline] inserted ${count} raw feed items, ${githubTop.length} repos, ${allDatasets.length} datasets`)

  await step('update-velocity-scores', updateVelocityScores)
  await step('ensure-all-models', ensureAllModels)

  return count
}

// Phase 2 of the pipeline: screen pending items and run all intelligence tasks.
// Runs 10 minutes after fetchIngest to give ingest time to complete.
function collectFailures(labels: string[], results: PromiseSettledResult<void>[]): string[] {
  return results
    .map((r, i) => {
      if (r.status === 'rejected') {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
        console.error(`[pipeline] ${labels[i]} failed:`, r.reason)
        return `${labels[i]}: ${msg}`
      }
      return null
    })
    .filter((e): e is string => e !== null)
}

// Split into two cron-sized invocations (see fetch-intel / fetch-intel-2 routes) —
// running both phases in one function regularly exceeded Vercel's 300s function
// timeout on heavy news days. Phase 2 is deliberately DB-driven only (no
// in-memory hand-off from phase 1) so the two can run as separate invocations.
export async function fetchIntelligencePhase1(): Promise<void> {
  console.log('[pipeline] starting intelligence phase 1...')

  const { items: newItems, entityMap, toolNames } = await screenPendingItems()
  console.log(`[pipeline] ${newItems.length} items passed relevance screen`)

  // No velocity recompute here (removed — was a duplicate of fetchIngest's call,
  // scanning/rewriting the same 30-day window a second time with no new rows in
  // between). Newly-screened items pick up their velocity_score on the next
  // fetchIngest run; that's an acceptable staleness window, not a correctness bug —
  // screened=0 items were already excluded from feed display regardless of score.

  // Query recent screened items for model refresh context
  const { rows: recentRows } = await db.execute({
    sql: `SELECT id, source, title, url, summary, raw_content, published_at, fetched_at, topic_tags, velocity_score, is_read, hook FROM feed_items WHERE screened = 1 ORDER BY fetched_at DESC LIMIT 200`,
    args: [],
  })
  const recentItems = (recentRows as any[]).map(r => ({
    ...r,
    topic_tags: JSON.parse(r.topic_tags ?? '[]'),
  })) as FeedItem[]

  const phase1: { label: string; promise: Promise<void> }[] = [
    { label: 'generateHooks', promise: generateHooks() },
    { label: 'generateYoutubeSummaries', promise: generateYoutubeSummaries() },
    { label: 'embedAnyMissing', promise: embedAnyMissing() },
  ]
  if (recentItems.length > 0) phase1.push({ label: 'refreshModelsFromFeed', promise: refreshModelsFromFeed(recentItems) })
  if (toolNames.length > 0) phase1.push({ label: 'classifyToolNames', promise: classifyToolNames(toolNames) })
  if (newItems.length > 0) {
    phase1.push({ label: 'updateStoryThreads', promise: updateStoryThreads(newItems, entityMap) })
    phase1.push({ label: 'saveEntityMentions', promise: saveEntityMentions(newItems, entityMap) })
  }

  const p1Results = await Promise.allSettled(phase1.map(t => t.promise))
  const failures = collectFailures(phase1.map(t => t.label), p1Results)

  if (failures.length > 0) {
    throw new Error(`Intelligence phase 1 completed with ${failures.length} task failure(s):\n${failures.join('\n')}`)
  }
}

export async function fetchIntelligencePhase2(): Promise<void> {
  console.log('[pipeline] starting intelligence phase 2...')

  const phase2: { label: string; promise: Promise<void> }[] = [
    { label: 'linkThreads', promise: linkThreads() },
    { label: 'backfillPredictionEvidence', promise: backfillPredictionEvidence() },
    { label: 'backfillEntities', promise: backfillEntities() },
    { label: 'seedRadarIfEmpty', promise: seedRadarIfEmpty() },
    { label: 'reclassifyStaleTools', promise: reclassifyStaleTools() },
    { label: 'pruneOldFeedItems', promise: pruneOldFeedItems() },
    { label: 'pruneOldRejectedItemsLog', promise: pruneOldRejectedItemsLog() },
    { label: 'updateAccelerationScores', promise: updateAccelerationScores() },
  ]

  const p2Results = await Promise.allSettled(phase2.map(t => t.promise))
  const failures = collectFailures(phase2.map(t => t.label), p2Results)

  if (failures.length > 0) {
    throw new Error(`Intelligence phase 2 completed with ${failures.length} task failure(s):\n${failures.join('\n')}`)
  }
}

// Kept for manual/local triggering (instrumentation.ts's dev boot, /api/feed/refresh,
// /api/cron/fetch) where both phases need to run in one call. Runs them concurrently,
// not sequentially — phase 2 has no in-memory dependency on phase 1 (see the phase
// functions above), and awaiting phase 1 to completion first would double this
// wrapper's wall time and put single-invocation callers at *more* risk of the same
// 300s timeout the phase split was meant to avoid.
export async function fetchIntelligence(): Promise<void> {
  const results = await Promise.allSettled([fetchIntelligencePhase1(), fetchIntelligencePhase2()])
  const failures = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => (r.reason instanceof Error ? r.reason.message : String(r.reason)))
  if (failures.length > 0) {
    throw new Error(`Intelligence phases completed with failure(s):\n${failures.join('\n')}`)
  }
}

// Runs ingest then intelligence in one call, for manual/local triggering only.
export async function fetchAll(): Promise<number> {
  const count = await fetchIngest()
  await fetchIntelligence()
  return count
}
