import cron from 'node-cron'
import db from './db'
import { fetchArxiv } from './sources/arxiv'
import { fetchHackerNews } from './sources/hackernews'
import { fetchRSS } from './sources/rss'
import { fetchGithubTrending } from './sources/github'
import { fetchGithubTop } from './sources/github_top'
import { fetchHuggingFace } from './sources/huggingface'
import { fetchDatasets } from './sources/datasets'
import { fetchKaggleDatasets } from './sources/kaggle'
import type { Dataset, FeedItem, GithubRepo } from './types'
import { updateVelocityScores } from './intelligence/velocity'
import { classifyForRadar, seedRadarIfEmpty } from './intelligence/radar'
import { ensureAllModels, refreshModelsFromFeed } from './intelligence/models'
import { screenAndHook, generateHooks } from './intelligence/hooks'
import { updateStoryThreads, linkThreads } from './intelligence/stories'
import { backfillPredictionEvidence } from './intelligence/predictions'
import { saveEntityMentions, backfillEntities } from './intelligence/entities'

async function insertItems(items: FeedItem[]): Promise<{ count: number; newItems: FeedItem[] }> {
  const newItems: FeedItem[] = []
  for (const item of items) {
    const result = await db.execute({
      sql: `INSERT OR IGNORE INTO feed_items (id, source, title, url, summary, raw_content, published_at, fetched_at, topic_tags, velocity_score, is_read, hook) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [item.id, item.source, item.title, item.url, item.summary ?? null, item.raw_content ?? null, item.published_at ?? null, item.fetched_at, JSON.stringify(item.topic_tags), item.velocity_score, item.is_read, item.hook ?? null],
    })
    if (result.rowsAffected > 0) newItems.push(item)
  }
  return { count: newItems.length, newItems }
}

async function insertRepos(repos: GithubRepo[]): Promise<void> {
  for (const repo of repos) {
    await db.execute({
      sql: `INSERT INTO github_repos (id, name, full_name, url, description, language, stars_total, stars_today, topics, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(url) DO UPDATE SET stars_total=excluded.stars_total, stars_today=excluded.stars_today, fetched_at=excluded.fetched_at`,
      args: [repo.id, repo.name, repo.full_name, repo.url, repo.description ?? null, repo.language ?? null, repo.stars_total, repo.stars_today, JSON.stringify(repo.topics), repo.fetched_at],
    })
  }
}

async function insertDatasets(datasets: Dataset[]): Promise<void> {
  for (const d of datasets) {
    await db.execute({
      sql: `INSERT INTO datasets (id, full_name, url, description, task_categories, modalities, size_category, license, downloads, likes, last_modified, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(full_name) DO UPDATE SET downloads=excluded.downloads, likes=excluded.likes, last_modified=excluded.last_modified, fetched_at=excluded.fetched_at`,
      args: [d.id, d.full_name, d.url, d.description ?? null, JSON.stringify(d.task_categories), JSON.stringify(d.modalities), d.size_category ?? null, d.license ?? null, d.downloads, d.likes, d.last_modified ?? null, d.fetched_at],
    })
  }
}

export async function fetchAll(): Promise<number> {
  console.log('[pipeline] starting fetch...')
  const [arxiv, hn, rss, github, huggingface, githubTop, hfDatasets, kaggleDatasets] = await Promise.all([
    fetchArxiv(), fetchHackerNews(), fetchRSS(), fetchGithubTrending(),
    fetchHuggingFace(), fetchGithubTop(), fetchDatasets(), fetchKaggleDatasets(),
  ])

  const allDatasets = [...hfDatasets]
  const seenDatasets = new Set(hfDatasets.map(d => d.full_name))
  for (const d of kaggleDatasets) { if (!seenDatasets.has(d.full_name)) { seenDatasets.add(d.full_name); allDatasets.push(d) } }

  const allFeedItems = [...arxiv, ...hn, ...rss, ...github, ...huggingface]
  console.log(`[pipeline] screening ${allFeedItems.length} candidates...`)
  const { items: screened, entityMap } = await screenAndHook(allFeedItems)
  console.log(`[pipeline] ${screened.length}/${allFeedItems.length} passed relevance screen`)

  const { count: newItemCount, newItems } = await insertItems(screened)
  await insertRepos(githubTop)
  await insertDatasets(allDatasets)

  console.log(`[pipeline] inserted ${newItemCount} feed items, ${githubTop.length} repos, ${allDatasets.length} datasets`)

  await updateVelocityScores()
  await ensureAllModels()
  generateHooks().catch(console.error) // backfill any items without hooks
  if (allFeedItems.length > 0) {
    refreshModelsFromFeed(allFeedItems).catch(console.error)
    classifyForRadar(allFeedItems).catch(console.error)
  }
  if (newItems.length > 0) {
    updateStoryThreads(newItems).catch(console.error)
    saveEntityMentions(newItems, entityMap).catch(console.error)
  }
  linkThreads().catch(console.error)
  backfillPredictionEvidence().catch(console.error)
  backfillEntities().catch(console.error)
  seedRadarIfEmpty().catch(console.error)

  return newItemCount
}

export function startCron(): void {
  cron.schedule('0 */6 * * *', () => {
    console.log('[pipeline] cron: running fetch')
    fetchAll().catch(console.error)
  })
  console.log('[pipeline] cron scheduled (every 6 hours)')
}
