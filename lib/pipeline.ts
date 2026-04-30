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
import { classifyForRadar, seedRadarIfEmpty, reclassifyStaleTools } from './intelligence/radar'
import { ensureAllModels, refreshModelsFromFeed } from './intelligence/models'
import { screenAndHook, generateHooks } from './intelligence/hooks'
import { updateStoryThreads, linkThreads } from './intelligence/stories'
import { backfillPredictionEvidence } from './intelligence/predictions'
import { saveEntityMentions, backfillEntities } from './intelligence/entities'

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
  await Promise.all([insertRepos(githubTop), insertDatasets(allDatasets)])

  console.log(`[pipeline] inserted ${newItemCount} feed items, ${githubTop.length} repos, ${allDatasets.length} datasets`)

  await updateVelocityScores()
  await ensureAllModels()

  // Phase 1: parallel intelligence tasks — all awaited so Vercel doesn't kill them early
  const phase1: Promise<void>[] = [generateHooks()]
  if (allFeedItems.length > 0) {
    phase1.push(refreshModelsFromFeed(allFeedItems))
    phase1.push(classifyForRadar(allFeedItems))
  }
  if (newItems.length > 0) {
    phase1.push(updateStoryThreads(newItems))
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
