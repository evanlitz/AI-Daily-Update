import Parser from 'rss-parser'
import he from 'he'
import crypto from 'crypto'
import type { FeedItem } from '../types'

const parser = new Parser({
  customFields: { item: ['content:encoded'] },
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIPulse/1.0)' },
  timeout: 8000,
})

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function stableId(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
}

function stripTrackingParams(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'source']) {
      u.searchParams.delete(p)
    }
    return u.toString()
  } catch {
    return rawUrl
  }
}

const FEEDS = [
  { url: 'https://blog.google/innovation-and-ai/technology/ai/rss/', source: 'rss:google-ai', tags: ['models'] },
  { url: 'https://importai.substack.com/feed', source: 'rss:import-ai', tags: ['industry'] },
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', source: 'rss:techcrunch-ai', tags: ['industry'] },
  { url: 'https://www.technologyreview.com/feed/', source: 'rss:mit-tech-review', tags: ['research'] },
  { url: 'https://feeds.feedburner.com/blogspot/gJZg', source: 'rss:google-research', tags: ['research'] },
  { url: 'https://simonwillison.net/atom/everything/', source: 'rss:simon-willison', tags: ['tools'] },
  { url: 'https://sebastianraschka.com/rss_feed.xml', source: 'rss:raschka', tags: ['research'] },
  { url: 'https://www.interconnects.ai/feed', source: 'rss:interconnects', tags: ['research'] },
]

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
}

const CUTOFF_DAYS = 14

async function fetchFeed(feed: typeof FEEDS[number]): Promise<FeedItem[]> {
  try {
    const result = await Promise.race([parser.parseURL(feed.url), timeout(8000)])
    const now = new Date().toISOString()
    const cutoff = Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000

    const items = (result.items ?? [])
      .slice(0, 20) // cap at 20 per feed before date filtering
      .map((item: any) => {
        const rawContent = item['content:encoded'] ?? item.content ?? item.contentSnippet ?? ''
        const url = stripTrackingParams(item.link ?? '')
        const pubDate = item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : null)
        return {
          id: stableId(url || item.title || String(Math.random())),
          source: feed.source,
          title: he.decode(stripHtml(item.title ?? '')),
          url,
          raw_content: stripHtml(rawContent).slice(0, 600),
          published_at: pubDate,
          fetched_at: now,
          topic_tags: feed.tags,
          velocity_score: 0,
          is_read: 0,
        }
      })
      // Drop items older than cutoff (but keep items with no date)
      .filter(item => !item.published_at || new Date(item.published_at).getTime() > cutoff)

    return items as FeedItem[]
  } catch (err) {
    console.error(`[rss:${feed.source}] fetch failed:`, err)
    return []
  }
}

export async function fetchRSS(): Promise<FeedItem[]> {
  const results = await Promise.all(FEEDS.map(fetchFeed))
  return results.flat()
}
