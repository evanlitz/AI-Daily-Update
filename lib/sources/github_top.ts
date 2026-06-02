import axios from 'axios'
import crypto from 'crypto'
import type { GithubRepo } from '../types'

const HEADERS: Record<string, string> = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'AIPulse/1.0',
}
if (process.env.GITHUB_TOKEN) HEADERS['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`

function stableId(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
}

// Stars_today is no longer available via the API (was only on the trending scrape page).
// We sort by total stars and let the UI show stars_total instead.
const TOPICS = ['llm', 'machine-learning', 'generative-ai', 'large-language-model', 'transformers']

async function searchRepos(q: string): Promise<any[]> {
  try {
    const res = await axios.get('https://api.github.com/search/repositories', {
      params: { q, sort: 'stars', order: 'desc', per_page: 30 },
      headers: HEADERS,
      timeout: 15000,
    })
    return res.data.items ?? []
  } catch (err) {
    console.error('[github_top] search error:', err)
    return []
  }
}

export async function fetchGithubTop(): Promise<GithubRepo[]> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const now = new Date().toISOString()

  const results = await Promise.all(TOPICS.map(t => searchRepos(`topic:${t} pushed:>${dayAgo}`)))

  const map = new Map<string, GithubRepo>()

  for (const repos of results) {
    for (const repo of repos) {
      if (map.has(repo.html_url)) continue
      const name = (repo.full_name as string).split('/')[1] ?? repo.full_name
      map.set(repo.html_url, {
        id: stableId(repo.html_url),
        name,
        full_name: repo.full_name as string,
        url: repo.html_url as string,
        description: (repo.description as string | null)?.slice(0, 300) ?? undefined,
        language: (repo.language as string | null) ?? undefined,
        stars_total: repo.stargazers_count as number,
        stars_today: 0,
        topics: (repo.topics as string[] | undefined) ?? [],
        fetched_at: now,
      })
    }
  }

  const repos = Array.from(map.values()).sort((a, b) => b.stars_total - a.stars_total)
  console.log(`[github_top] ${repos.length} repos via API`)
  return repos
}
