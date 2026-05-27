import axios from 'axios'
import he from 'he'
import crypto from 'crypto'
import type { FeedItem } from '../types'

const SUBREDDITS = [
  { name: 'MachineLearning', minScore: 50, tags: ['research'] as string[] },
  { name: 'LocalLLaMA',      minScore: 30, tags: ['tools', 'models'] as string[] },
  { name: 'artificial',      minScore: 50, tags: ['industry'] as string[] },
]

// For r/artificial (broad sub) require at least one AI keyword
const AI_KEYWORDS = /llm|gpt|claude|gemini|llama|mistral|transformer|diffusion|rag|fine.?tun|benchmark|paper|model|agent|openai|anthropic|deepmind|hugging.?face|neural|inference|quantiz/i

const HEADERS = { 'User-Agent': 'AIPulse/1.0 personal-dashboard' }

function stableId(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function getTopicTags(title: string, base: string[]): string[] {
  const t = title.toLowerCase()
  if (/paper|arxiv|research|study|benchmark/.test(t)) return ['research']
  if (/gpt|claude|gemini|llama|mistral|model|openai|anthropic|deepmind/.test(t)) return ['models']
  if (/tool|framework|library|sdk|api|open.?source|github|release/.test(t)) return ['tools']
  return base
}

async function fetchSubreddit(sub: typeof SUBREDDITS[number]): Promise<FeedItem[]> {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000
  const res = await axios.get(
    `https://www.reddit.com/r/${sub.name}/hot.json?limit=30`,
    { timeout: 10000, headers: HEADERS }
  )

  const posts: any[] = res.data?.data?.children ?? []
  const now = new Date().toISOString()

  return posts
    .map((c: any) => c.data)
    .filter((p: any) => {
      if (p.score < sub.minScore) return false
      if (p.stickied) return false
      if (p.created_utc * 1000 < cutoff) return false
      if (sub.name === 'artificial' && !AI_KEYWORDS.test(p.title + ' ' + (p.selftext ?? ''))) return false
      return true
    })
    .map((p: any) => {
      const permalink = `https://www.reddit.com${p.permalink}`
      const externalUrl = !p.is_self && p.url ? p.url : permalink
      const content = stripHtml(he.decode(p.selftext ?? '')).slice(0, 600)
      return {
        id: stableId(`reddit:${p.id}`),
        source: `reddit:${sub.name.toLowerCase()}`,
        title: he.decode(p.title),
        url: externalUrl,
        raw_content: content || undefined,
        published_at: new Date(p.created_utc * 1000).toISOString(),
        fetched_at: now,
        topic_tags: getTopicTags(p.title, sub.tags),
        velocity_score: 0,
        is_read: 0,
      }
    })
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
