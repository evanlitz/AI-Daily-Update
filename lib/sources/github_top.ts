import axios from 'axios'
import * as cheerio from 'cheerio'
import he from 'he'
import crypto from 'crypto'
import type { GithubRepo } from '../types'

const AI_KEYWORDS = /llm|ai\b|gpt|claude|gemini|llama|ml\b|neural|diffusion|transformer|rag|agent/i
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; AIPulse/1.0)' }

function stableId(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
}

async function scrapePage(url: string): Promise<GithubRepo[]> {
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 })
  const $ = cheerio.load(res.data)
  const repos: GithubRepo[] = []
  const now = new Date().toISOString()

  $('article.Box-row').each((_, el) => {
    const nameEl = $(el).find('h2.h3 a')
    const href = nameEl.attr('href') ?? ''
    const fullName = href.replace(/^\//, '').trim()
    const name = fullName.split('/')[1] ?? fullName
    const description = he.decode($(el).find('p.col-9').text().trim())
    const language = $(el).find('[itemprop="programmingLanguage"]').text().trim()
    const starsText = $(el).find('a[href$="/stargazers"]').text().replace(/,/g, '').trim()
    const starsTotal = parseInt(starsText) || 0
    const starsTodayText = $(el).find('.d-inline-block.float-sm-right').text()
    const starsTodayMatch = starsTodayText.match(/(\d[\d,]*)/)
    const starsToday = starsTodayMatch ? parseInt(starsTodayMatch[1].replace(/,/g, '')) : 0
    const repoUrl = `https://github.com/${fullName}`

    if (!fullName || (!AI_KEYWORDS.test(fullName) && !AI_KEYWORDS.test(description))) return

    repos.push({
      id: stableId(repoUrl),
      name,
      full_name: fullName,
      url: repoUrl,
      description: description.slice(0, 300),
      language: language || undefined,
      stars_total: starsTotal,
      stars_today: starsToday,
      topics: [],
      fetched_at: now,
    })
  })

  return repos
}

export async function fetchGithubTop(): Promise<GithubRepo[]> {
  try {
    const results = await Promise.all([
      scrapePage('https://github.com/trending?since=daily'),
      scrapePage('https://github.com/trending/python?since=daily'),
    ])
    const all = results.flat()
    if (all.length === 0) {
      console.warn('[github_top] selectors returned empty — GitHub HTML may have changed')
    }
    // deduplicate by full_name, keep highest stars_today
    const map = new Map<string, GithubRepo>()
    for (const repo of all) {
      const existing = map.get(repo.full_name)
      if (!existing || repo.stars_today > existing.stars_today) {
        map.set(repo.full_name, repo)
      }
    }
    return Array.from(map.values()).sort((a, b) => b.stars_today - a.stars_today)
  } catch (err) {
    console.error('[github_top] fetch failed:', err)
    return []
  }
}
