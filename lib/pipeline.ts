import db from './db'
import { fetchArxiv } from './sources/arxiv'
import { fetchHackerNews } from './sources/hackernews'
import { fetchRSS } from './sources/rss'
import { fetchGithubTrending } from './sources/github'
import { fetchGithubTop } from './sources/github_top'
import { fetchHuggingFace } from './sources/huggingface'
import { fetchDatasets } from './sources/datasets'
import { fetchKaggleDatasets } from './sources/kaggle'
import { fetchReddit } from './sources/reddit'
import { fetchYoutube } from './sources/youtube'
import { fetchPapersWithCode } from './sources/paperswithcode'
import { fetchHFModels } from './sources/hf_models'
import type { Dataset, FeedItem, GithubRepo } from './types'
import { updateVelocityScores } from './intelligence/velocity'
import { classifyForRadar, classifyToolNames, seedRadarIfEmpty, reclassifyStaleTools } from './intelligence/radar'
import { ensureAllModels, refreshModelsFromFeed } from './intelligence/models'
import { screenAndHook, generateHooks } from './intelligence/hooks'
import { updateStoryThreads, linkThreads } from './intelligence/stories'
import { backfillPredictionEvidence } from './intelligence/predictions'
import { saveEntityMentions, backfillEntities } from './intelligence/entities'
import { generateYoutubeSummaries } from './intelligence/youtube_summaries'

async function insertItems(items: FeedItem[]): Promise<{ count: number; newItems: FeedItem[] }> {
  if (!items.length) return { count: 0, newItems: [] }
  const results = await db.batch(
    items.map(item => ({
      sql: `INSERT OR IGNORE INTO feed_items (id, source, title, url, summary, raw_content, published_at, fetched_at, topic_tags, velocity_score, is_read, hook) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [item.id, item.source, item.title, item.url, item.summary ?? null, item.raw_content ?? null, item.published_at ?? null, item.fetched_at, JSON.stringify(item.topic_tags), item.velocity_score, item.is_read, item.hook ?? null],
    }))
  )
  const newItems = items.filter((_, i) => results[i].rowsAffected > 0)
  return { count: newItems.length, newItems }
}

async function insertRepos(repos: GithubRepo[]): Promise<void> {
  if (!repos.length) return
  await db.batch(repos.map(repo => ({
    sql: `INSERT INTO github_repos (id, name, full_name, url, description, language, stars_total, stars_today, topics, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(url) DO UPDATE SET stars_total=excluded.stars_total, stars_today=excluded.stars_today, fetched_at=excluded.fetched_at`,
    args: [repo.id, repo.name, repo.full_name, repo.url, repo.description ?? null, repo.language ?? null, repo.stars_total, repo.stars_today, JSON.stringify(repo.topics), repo.fetched_at],
  })))
}

async function insertDatasets(datasets: Dataset[]): Promise<void> {
  if (!datasets.length) return
  await db.batch(datasets.map(d => ({
    sql: `INSERT INTO datasets (id, full_name, url, description, task_categories, modalities, size_category, license, downloads, likes, last_modified, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(full_name) DO UPDATE SET downloads=excluded.downloads, likes=excluded.likes, last_modified=excluded.last_modified, fetched_at=excluded.fetched_at`,
    args: [d.id, d.full_name, d.url, d.description ?? null, JSON.stringify(d.task_categories), JSON.stringify(d.modalities), d.size_category ?? null, d.license ?? null, d.downloads, d.likes, d.last_modified ?? null, d.fetched_at],
  })))
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

export async function fetchAll(): Promise<number> {
  console.log('[pipeline] starting fetch...')

  // Pre-load known YouTube URLs so fetchYoutube can skip up-to-date channels
  // and avoid fetching transcripts for videos already in the DB
  const { rows: ytRows } = await db.execute(
    `SELECT url FROM feed_items WHERE source LIKE 'youtube:%'`
  )
  const knownYoutubeUrls = new Set((ytRows as any[]).map(r => r.url as string))

  const [arxiv, hn, rss, github, huggingface, githubTop, hfDatasets, kaggleDatasets, reddit, pwc, hfModels, youtube] = await Promise.all([
    fetchArxiv(), fetchHackerNews(), fetchRSS(), fetchGithubTrending(),
    fetchHuggingFace(), fetchGithubTop(), fetchDatasets(), fetchKaggleDatasets(),
    fetchReddit(), fetchPapersWithCode(), fetchHFModels(), fetchYoutube(knownYoutubeUrls),
  ])

  const allDatasets = [...hfDatasets]
  const seenDatasets = new Set(hfDatasets.map(d => d.full_name))
  for (const d of kaggleDatasets) { if (!seenDatasets.has(d.full_name)) { seenDatasets.add(d.full_name); allDatasets.push(d) } }

  const allFeedItems = [...arxiv, ...hn, ...rss, ...github, ...huggingface, ...reddit, ...pwc, ...hfModels, ...youtube]

  // Record per-source item counts for health monitoring
  const sourceCounts = new Map<string, number>()
  for (const item of allFeedItems) {
    sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1)
  }
  sourceCounts.set('github-top', githubTop.length)
  sourceCounts.set('hf-datasets', hfDatasets.length)
  sourceCounts.set('kaggle', kaggleDatasets.length)
  await recordSourceRuns(sourceCounts).catch(console.error)

  const newCandidates = await filterNewItems(allFeedItems)
  console.log(`[pipeline] ${newCandidates.length}/${allFeedItems.length} are new — screening...`)
  const { items: screened, entityMap, toolNames } = await screenAndHook(newCandidates)
  console.log(`[pipeline] ${screened.length}/${newCandidates.length} passed relevance screen`)

  const { count: newItemCount, newItems } = await insertItems(screened)
  await Promise.all([insertRepos(githubTop), insertDatasets(allDatasets)])

  console.log(`[pipeline] inserted ${newItemCount} feed items, ${githubTop.length} repos, ${allDatasets.length} datasets`)

  await updateVelocityScores()
  await ensureAllModels()

  // Phase 1: parallel intelligence tasks — all awaited so Vercel doesn't kill them early
  const phase1: Promise<void>[] = [generateHooks(), generateYoutubeSummaries()]
  if (allFeedItems.length > 0) {
    phase1.push(refreshModelsFromFeed(allFeedItems))
  }
  if (toolNames.length > 0) {
    phase1.push(classifyToolNames(toolNames))
  }
  if (newItems.length > 0) {
    phase1.push(updateStoryThreads(newItems, entityMap))
    phase1.push(saveEntityMentions(newItems, entityMap))
  }
  await Promise.all(phase1.map(p => p.catch(console.error)))

  // Phase 2: tasks that benefit from phase 1 completing (linkThreads needs updated story state)
  await Promise.all([
    linkThreads(),
    backfillPredictionEvidence(),
    backfillEntities(),
    seedRadarIfEmpty(),
    reclassifyStaleTools(),
    pruneOldFeedItems(),
  ].map(p => p.catch(console.error)))

  return newItemCount
}
