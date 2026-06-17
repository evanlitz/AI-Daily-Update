import axios from 'axios'
import crypto from 'crypto'
import type { FeedItem } from '../types'

const HEADERS: Record<string, string> = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'AIPulse/1.0',
}
if (process.env.GITHUB_TOKEN) HEADERS['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`

function stableId(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
}

// 5 topic queries → up to 150 repos/run, deduped. Add GITHUB_TOKEN env var to raise
// rate limit from 10 req/min to 30 req/min (both sources share the same quota).
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
    console.error('[github] search error:', err instanceof Error ? err.message : err)
    return []
  }
}

export async function fetchGithubTrending(): Promise<FeedItem[]> {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const now = new Date().toISOString()

    const results = await Promise.all(TOPICS.map(t => searchRepos(`topic:${t} pushed:>${weekAgo}`)))

    const seen = new Set<string>()
    const items: FeedItem[] = []

    for (const repos of results) {
      for (const repo of repos) {
        if (!repo?.html_url || !repo?.full_name) continue
        if (seen.has(repo.html_url)) continue
        seen.add(repo.html_url)
        const parts = [
          repo.description ?? '',
          repo.topics?.length ? `Topics: ${(repo.topics as string[]).slice(0, 8).join(', ')}` : '',
        ].filter(Boolean)
        items.push({
          id: stableId(repo.html_url),
          source: 'github',
          title: repo.full_name as string,
          url: repo.html_url as string,
          raw_content: parts.join(' | ').slice(0, 1000) || undefined,
          published_at: (repo.pushed_at as string) ?? now,
          fetched_at: now,
          topic_tags: ['tools'],
          velocity_score: 0,
          is_read: 0,
        })
      }
    }

    console.log(`[github] ${items.length} repos via API`)
    return items
  } catch (err) {
    console.error('[github] fetch failed:', err instanceof Error ? err.message : err)
    return []
  }
}
