import axios from 'axios'
import he from 'he'
import type { FeedItem } from '../types'
import { extractPageContent } from '../extract-content'
import { getTopicTags } from './_topic-tags'

function stripTrackingParams(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'source']) {
      u.searchParams.delete(p)
    }
    return u.toString()
  } catch { return rawUrl }
}

// HN Algolia supports numericFilters=created_at_i>UNIX_TIMESTAMP for recency.
// 72h (not 48h) so a single failed pipeline run doesn't permanently drop a story —
// DB-level dedup (INSERT OR IGNORE) handles any overlap from the extra window.
function since72hFilter(): string {
  const ts = Math.floor((Date.now() - 72 * 60 * 60 * 1000) / 1000)
  return `created_at_i>${ts}`
}

const QUERIES = [
  'AI LLM',
  'large language model',
  'Claude Gemini GPT',
  'machine learning',
  'artificial intelligence',
]

export async function fetchHackerNews(): Promise<FeedItem[]> {
  try {
    const recencyFilter = since72hFilter()
    const now = new Date().toISOString()
    const seen = new Set<string>()
    const results: FeedItem[] = []

    // Run multiple focused queries in parallel to get broad coverage
    const responses = await Promise.all(
      QUERIES.map(q =>
        axios.get(
          `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&numericFilters=${recencyFilter}&hitsPerPage=15`,
          { timeout: 10000 }
        ).catch(() => null)
      )
    )

    for (const res of responses) {
      const hits: any[] = res?.data?.hits ?? []
      for (const hit of hits) {
        const id = String(hit.objectID ?? '')
        if (!id || seen.has(id)) continue
        seen.add(id)
        const rawUrl = hit.url ?? `https://news.ycombinator.com/item?id=${id}`
        results.push({
          id,
          source: 'hn',
          title: he.decode(hit.title ?? ''),
          url: stripTrackingParams(rawUrl),
          raw_content: hit.story_text ? he.decode(hit.story_text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 1500) : undefined,
          published_at: hit.created_at ? new Date(hit.created_at).toISOString() : now,
          fetched_at: now,
          topic_tags: getTopicTags(hit.title ?? '', ['industry']),
          velocity_score: 0,
          is_read: 0,
        })
      }
    }

    // Enrich link posts with page content — runs in parallel, 5s timeout each
    const enriched = await Promise.all(results.map(async item => {
      if (item.raw_content || item.url.startsWith('https://news.ycombinator.com')) return item
      const content = await extractPageContent(item.url)
      return content ? { ...item, raw_content: content } : item
    }))

    const withContent = enriched.filter(i => i.raw_content).length
    console.log(`[hackernews] fetched ${results.length} stories (${withContent} with body content)`)
    return enriched
  } catch (err) {
    console.error('[hackernews] fetch failed:', err)
    return []
  }
}
