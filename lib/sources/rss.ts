import Parser from 'rss-parser'
import he from 'he'
import crypto from 'crypto'
import type { FeedItem } from '../types'

const parser = new Parser({
  customFields: { item: ['content:encoded'] },
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
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
  // ── Official AI Lab Blogs ────────────────────────────────────────────────────
  { url: 'https://openai.com/blog/rss.xml',                              source: 'rss:openai',              tags: ['models', 'industry'] },
  { url: 'https://www.anthropic.com/rss.xml',                            source: 'rss:anthropic',           tags: ['models', 'safety', 'industry'] },
  { url: 'https://deepmind.google/blog/rss.xml',                         source: 'rss:deepmind',            tags: ['research', 'models'] },
  { url: 'https://ai.meta.com/blog/rss/',                                source: 'rss:meta-ai',             tags: ['research', 'models', 'industry'] },
  { url: 'https://mistral.ai/news/rss/',                                 source: 'rss:mistral',             tags: ['models', 'industry'] },
  { url: 'https://cohere.com/blog/rss',                                  source: 'rss:cohere',              tags: ['models', 'industry'] },

  // ── Big Tech AI Blogs ────────────────────────────────────────────────────────
  { url: 'https://blog.google/innovation-and-ai/technology/ai/rss/',     source: 'rss:google-ai',           tags: ['models'] },
  { url: 'https://research.google/blog/rss',                             source: 'rss:google-research',     tags: ['research'] },
  { url: 'https://www.microsoft.com/en-us/research/blog/feed/',          source: 'rss:microsoft-research',  tags: ['research'] },
  { url: 'https://blogs.microsoft.com/ai/feed/',                         source: 'rss:microsoft-ai',        tags: ['industry', 'tools'] },
  { url: 'https://developer.nvidia.com/blog/feed/',                      source: 'rss:nvidia',              tags: ['infrastructure', 'tools'] },
  { url: 'https://machinelearning.apple.com/rss.xml',                    source: 'rss:apple-ml',            tags: ['research', 'models'] },
  { url: 'https://aws.amazon.com/blogs/machine-learning/feed/',          source: 'rss:aws-ml',              tags: ['infrastructure', 'tools'] },

  // ── Curated AI Newsletters ───────────────────────────────────────────────────
  { url: 'https://importai.substack.com/feed',                           source: 'rss:import-ai',           tags: ['industry'] },
  { url: 'https://www.interconnects.ai/feed',                            source: 'rss:interconnects',       tags: ['research'] },
  { url: 'https://sebastianraschka.com/rss_feed.xml',                    source: 'rss:raschka',             tags: ['research'] },
  { url: 'https://thegradient.pub/rss/',                                 source: 'rss:the-gradient',        tags: ['research'] },
  { url: 'https://newsletter.theaiedge.io/feed',                         source: 'rss:ai-edge',             tags: ['research', 'tools'] },
  { url: 'https://www.latent.space/feed',                                source: 'rss:latent-space',        tags: ['research', 'tools'] },
  { url: 'https://tldr.tech/ai/rss',                                     source: 'rss:tldr-ai',             tags: ['industry', 'tools'] },
  { url: 'https://simonwillison.net/atom/everything/',                   source: 'rss:simon-willison',      tags: ['tools'] },
  { url: 'https://huggingface.co/blog/feed.xml',                         source: 'rss:huggingface-blog',    tags: ['tools', 'models'] },
  { url: 'https://www.oneusefulthing.org/feed',                          source: 'rss:one-useful-thing',    tags: ['industry'] },
  { url: 'https://thezvi.substack.com/feed',                             source: 'rss:zvi',                 tags: ['industry', 'research'] },

  // ── Academic / Research Labs ─────────────────────────────────────────────────
  { url: 'https://bair.berkeley.edu/blog/feed.xml',                      source: 'rss:bair',                tags: ['research'] },

  // ── Model Labs / Infra ───────────────────────────────────────────────────────
  { url: 'https://www.together.ai/blog/rss.xml',                         source: 'rss:together-ai',         tags: ['models', 'infrastructure'] },
  { url: 'https://stability.ai/news-updates?format=rss',                  source: 'rss:stability-ai',        tags: ['models'] },

  // ── Tech News ────────────────────────────────────────────────────────────────
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', source: 'rss:techcrunch-ai',      tags: ['industry'] },
  { url: 'https://www.technologyreview.com/feed/',                        source: 'rss:mit-tech-review',    tags: ['research'] },
  { url: 'https://venturebeat.com/category/ai/feed',                      source: 'rss:venturebeat-ai',     tags: ['industry'] },
  { url: 'https://www.marktechpost.com/feed/',                            source: 'rss:marktechpost',       tags: ['research', 'industry'] },
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
          raw_content: stripHtml(rawContent).slice(0, 1500),
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
