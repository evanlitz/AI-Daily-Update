import axios from 'axios'
import he from 'he'
import crypto from 'crypto'
import type { FeedItem } from '../types'
import { extractPageContent } from '../extract-content'
import { getTopicTags } from './_topic-tags'

const SUBREDDITS = [
  { name: 'MachineLearning', minScore: 50,  tags: ['research'] as string[], filterKeywords: false },
  { name: 'LocalLLaMA',      minScore: 30,  tags: ['tools', 'models'] as string[], filterKeywords: false },
  { name: 'artificial',      minScore: 50,  tags: ['industry'] as string[], filterKeywords: true },
]

const AI_KEYWORDS = /llm|gpt|claude|gemini|llama|mistral|transformer|diffusion|rag|fine.?tun|benchmark|paper|model|agent|openai|anthropic|deepmind|hugging.?face|neural|inference|quantiz/i

const CUTOFF_HOURS = 48

function stableId(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)
}

function safeIsoDate(epochSeconds: number, fallback: string): string {
  const d = new Date(epochSeconds * 1000)
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString()
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

async function fetchSubreddit(sub: typeof SUBREDDITS[number]): Promise<FeedItem[]> {
  const after = Math.floor((Date.now() - CUTOFF_HOURS * 60 * 60 * 1000) / 1000)

  const res = await axios.get('https://api.pullpush.io/reddit/search/submission', {
    params: {
      subreddit: sub.name,
      sort: 'desc',
      sort_type: 'score',
      size: 50,
      after,
    },
    timeout: 15000,
    headers: { 'User-Agent': 'AIPulse/1.0' },
  })

  const posts: any[] = res.data?.data ?? []
  const now = new Date().toISOString()

  const items = posts
    .filter((p: any) => {
      if ((p.score ?? 0) < sub.minScore) return false
      if (p.stickied) return false
      if (sub.filterKeywords && !AI_KEYWORDS.test(p.title + ' ' + (p.selftext ?? ''))) return false
      return true
    })
    .map((p: any) => {
      const permalink = `https://www.reddit.com${p.permalink}`
      const externalUrl = !p.is_self && p.url && !p.url.includes('reddit.com') ? p.url : permalink
      const content = stripHtml(he.decode(p.selftext ?? '')).slice(0, 1500)
      return {
        id: stableId(`reddit:${p.id}`),
        source: `reddit:${sub.name.toLowerCase()}`,
        title: he.decode(p.title),
        url: externalUrl,
        raw_content: content || undefined,
        published_at: safeIsoDate(p.created_utc, now),
        fetched_at: now,
        topic_tags: getTopicTags(p.title, sub.tags),
        velocity_score: 0,
        is_read: 0,
      } as FeedItem
    })

  return Promise.all(items.map(async item => {
    if (item.raw_content || item.url.includes('reddit.com')) return item
    const content = await extractPageContent(item.url)
    return content ? { ...item, raw_content: content } : item
  }))
}

export async function fetchReddit(): Promise<FeedItem[]> {
  const results = await Promise.allSettled(SUBREDDITS.map(fetchSubreddit))
  const items: FeedItem[] = []
  const seen = new Set<string>()

  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('[reddit] subreddit fetch failed:', r.reason)
      continue
    }
    for (const item of r.value) {
      if (!seen.has(item.id)) { seen.add(item.id); items.push(item) }
    }
  }

  console.log(`[reddit] fetched ${items.length} posts`)
  return items
}
