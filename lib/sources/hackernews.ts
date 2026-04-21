import axios from 'axios'
import he from 'he'
import type { FeedItem } from '../types'

function getTopicTags(title: string): string[] {
  const t = title.toLowerCase()
  if (/paper|arxiv|research|study|benchmark/.test(t)) return ['research']
  if (/gpt|claude|gemini|llama|mistral|model|openai|anthropic|deepmind|o3|o4/.test(t)) return ['models']
  if (/tool|framework|library|sdk|api|open.?source|github|release|launch/.test(t)) return ['tools']
  return ['industry']
}

function stripTrackingParams(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'source']) {
      u.searchParams.delete(p)
    }
    return u.toString()
  } catch { return rawUrl }
}

// HN Algolia supports numericFilters=created_at_i>UNIX_TIMESTAMP for recency
function since48hFilter(): string {
  const ts = Math.floor((Date.now() - 48 * 60 * 60 * 1000) / 1000)
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
    const recencyFilter = since48hFilter()
    const now = new Date().toISOString()
    const seen = new Set<string>()
    const results: FeedItem[] = []

    // Run multiple focused queries in parallel to get broad coverage
    const responses = await Promise.all(
      QUERIES.map(q =>
        axios.get(
          `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&numericFilters=points>20,${recencyFilter}&hitsPerPage=15`,
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
          raw_content: hit.story_text ? he.decode(hit.story_text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 400) : undefined,
          published_at: hit.created_at ? new Date(hit.created_at).toISOString() : now,
          fetched_at: now,
          topic_tags: getTopicTags(hit.title ?? ''),
          velocity_score: 0,
          is_read: 0,
        })
      }
    }

    console.log(`[hackernews] fetched ${results.length} unique stories`)
    return results
  } catch (err) {
    console.error('[hackernews] fetch failed:', err)
    return []
  }
}
