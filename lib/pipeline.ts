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
import type { Dataset } from './types'
import { updateVelocityScores } from './intelligence/velocity'
import { classifyForRadar, seedRadarIfEmpty } from './intelligence/radar'
import { ensureAllModels, detectNewModels } from './intelligence/models'
import type { FeedItem, GithubRepo } from './types'

const insertFeedItem = db.prepare(`
  INSERT OR IGNORE INTO feed_items
    (id, source, title, url, summary, raw_content, published_at, fetched_at, topic_tags, velocity_score, is_read)
  VALUES
    (@id, @source, @title, @url, @summary, @raw_content, @published_at, @fetched_at, @topic_tags, @velocity_score, @is_read)
`)

const upsertRepo = db.prepare(`
  INSERT INTO github_repos
    (id, name, full_name, url, description, language, stars_total, stars_today, topics, fetched_at)
  VALUES
    (@id, @name, @full_name, @url, @description, @language, @stars_total, @stars_today, @topics, @fetched_at)
  ON CONFLICT(url) DO UPDATE SET
    stars_total = excluded.stars_total,
    stars_today = excluded.stars_today,
    fetched_at = excluded.fetched_at
`)

function insertItems(items: FeedItem[]): number {
  let inserted = 0
  const txn = db.transaction(() => {
    for (const item of items) {
      const info = insertFeedItem.run({
        ...item,
        summary: item.summary ?? null,
        raw_content: item.raw_content ?? null,
        published_at: item.published_at ?? null,
        topic_tags: JSON.stringify(item.topic_tags),
      })
      if (info.changes > 0) inserted++
    }
  })
  txn()
  return inserted
}

const upsertDataset = db.prepare(`
  INSERT INTO datasets (id, full_name, url, description, task_categories, modalities, size_category, license, downloads, likes, last_modified, fetched_at)
  VALUES (@id, @full_name, @url, @description, @task_categories, @modalities, @size_category, @license, @downloads, @likes, @last_modified, @fetched_at)
  ON CONFLICT(full_name) DO UPDATE SET
    downloads = excluded.downloads,
    likes = excluded.likes,
    last_modified = excluded.last_modified,
    fetched_at = excluded.fetched_at
`)

function insertDatasets(datasets: Dataset[]): void {
  const txn = db.transaction(() => {
    for (const d of datasets) {
      upsertDataset.run({
        ...d,
        description: d.description ?? null,
        task_categories: JSON.stringify(d.task_categories),
        modalities: JSON.stringify(d.modalities),
        size_category: d.size_category ?? null,
        license: d.license ?? null,
        last_modified: d.last_modified ?? null,
      })
    }
  })
  txn()
}

function insertRepos(repos: GithubRepo[]): void {
  const txn = db.transaction(() => {
    for (const repo of repos) {
      upsertRepo.run({
        ...repo,
        description: repo.description ?? null,
        language: repo.language ?? null,
        topics: JSON.stringify(repo.topics),
      })
    }
  })
  txn()
}

export async function fetchAll(): Promise<number> {
  console.log('[pipeline] starting fetch...')

  const [arxiv, hn, rss, github, huggingface, githubTop, hfDatasets, kaggleDatasets] = await Promise.all([
    fetchArxiv(),
    fetchHackerNews(),
    fetchRSS(),
    fetchGithubTrending(),
    fetchHuggingFace(),
    fetchGithubTop(),
    fetchDatasets(),
    fetchKaggleDatasets(),
  ])

  const sourceCounts: Record<string, number> = {
    arxiv: arxiv.length,
    hn: hn.length,
    rss: rss.length,
    github: github.length,
    huggingface: huggingface.length,
  }

  // Merge and deduplicate datasets by full_name
  const allDatasets = [...hfDatasets]
  const seenDatasets = new Set(hfDatasets.map(d => d.full_name))
  for (const d of kaggleDatasets) {
    if (!seenDatasets.has(d.full_name)) {
      seenDatasets.add(d.full_name)
      allDatasets.push(d)
    }
  }

  const allFeedItems = [...arxiv, ...hn, ...rss, ...github, ...huggingface]
  const newItemCount = insertItems(allFeedItems)
  insertRepos(githubTop)
  insertDatasets(allDatasets)

  console.log('[pipeline] fetched:', { ...sourceCounts, hfDatasets: hfDatasets.length, kaggleDatasets: kaggleDatasets.length })
  console.log(`[pipeline] inserted ${newItemCount} new feed items, ${githubTop.length} repos, ${allDatasets.length} datasets`)

  updateVelocityScores()
  ensureAllModels()
  detectNewModels(allFeedItems)
  seedRadarIfEmpty().catch(console.error)
  if (allFeedItems.length > 0) {
    classifyForRadar(allFeedItems).catch(err => console.error('[pipeline] radar classification error:', err))
  }

  return newItemCount
}

export function startCron(): void {
  cron.schedule('0 */6 * * *', () => {
    console.log('[pipeline] cron: running scheduled fetch')
    fetchAll().catch(console.error)
  })
  console.log('[pipeline] cron scheduled (every 6 hours)')
}
