import axios from 'axios'
import * as cheerio from 'cheerio'
import he from 'he'
import crypto from 'crypto'
import type { FeedItem } from '../types'

const AI_KEYWORDS = /llm|ai\b|gpt|claude|gemini|llama|ml\b|neural|diffusion|transformer|rag|agent/i

function stableId(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; AIPulse/1.0)' }

async function scrapePage(url: string): Promise<FeedItem[]> {
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 })
  const $ = cheerio.load(res.data)
  const items: FeedItem[] = []
  const now = new Date().toISOString()

  $('article.Box-row').each((_, el) => {
    const nameEl = $(el).find('h2.h3 a')
    const href = nameEl.attr('href') ?? ''
    const fullName = href.replace(/^\//, '').trim()
    const description = he.decode($(el).find('p.col-9').text().trim())
    const language = $(el).find('[itemprop="programmingLanguage"]').text().trim()
    const starsText = $(el).find('a[href$="/stargazers"]').text().replace(/,/g, '').trim()
    const stars = parseInt(starsText) || 0
    const repoUrl = `https://github.com/${fullName}`

    if (!fullName || (!AI_KEYWORDS.test(fullName) && !AI_KEYWORDS.test(description))) return

    items.push({
      id: stableId(repoUrl),
      source: 'github',
      title: he.decode(fullName),
      url: repoUrl,
      raw_content: description.slice(0, 800),
      fetched_at: now,
      topic_tags: ['tools'],
      velocity_score: 0,
      is_read: 0,
    })
  })

  return items
}

export async function fetchGithubTrending(): Promise<FeedItem[]> {
  try {
    const results = await Promise.all([
      scrapePage('https://github.com/trending/python?since=weekly'),
    ])
    const all = results.flat()
    if (all.length === 0) {
      console.warn('[github] selectors returned empty — GitHub HTML may have changed')
    }
    // deduplicate by url
    const seen = new Set<string>()
    return all.filter(item => {
      if (seen.has(item.url)) return false
      seen.add(item.url)
      return true
    })
  } catch (err) {
    console.error('[github] fetch failed:', err)
    return []
  }
}
