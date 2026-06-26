import crypto from 'crypto'
import type { FeedItem } from '../types'

const BASE = 'https://api.semanticscholar.org/graph/v1'
const FIELDS = 'paperId,title,abstract,url,year,citationCount,influentialCitationCount,publicationDate,externalIds'
const LOOKBACK_DAYS = 45   // wider window than arxiv's recency-only fetch
const FETCH_LIMIT = '100'

// Five AI subfields — broad enough to catch most published work, narrow enough
// to avoid noise from unrelated ML applications (medical imaging, finance, etc.)
const QUERIES = [
  'large language models reasoning',
  'generative AI vision language',
  'AI agents neural networks',
  'machine learning efficiency training',
  'AI safety alignment interpretability',
]

function stableId(paperId: string): string {
  return crypto.createHash('sha1').update(`ss:${paperId}`).digest('hex').slice(0, 16)
}

async function searchQuery(query: string, dateFrom: string): Promise<any[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const params = new URLSearchParams({
      query,
      fields: FIELDS,
      publicationDateOrYear: `${dateFrom}:`,
      limit: FETCH_LIMIT,
    })
    const headers: Record<string, string> = { 'User-Agent': 'AIPulse/1.0' }
    if (process.env.S2_API_KEY) headers['x-api-key'] = process.env.S2_API_KEY
    const res = await fetch(`${BASE}/paper/search?${params}`, {
      headers,
      signal: controller.signal,
    })
    if (!res.ok) {
      console.error(`[semanticscholar] search failed for "${query}": ${res.status}`)
      return []
    }
    const data = await res.json()
    return (data.data ?? []) as any[]
  } catch (err) {
    console.error(`[semanticscholar] error for "${query}":`, err)
    return []
  } finally {
    clearTimeout(timer)
  }
}

function safeIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export async function fetchSemanticScholar(): Promise<FeedItem[]> {
  try {
    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    const dateFrom = cutoff.toISOString().split('T')[0]
    const now = new Date().toISOString()

    // Without an API key, unauthenticated burst limit triggers at ~1 req/sec.
    // Stagger by 1.1s per query so 5 queries take ~5s total instead of firing simultaneously.
    // With an API key the header is set and this stagger becomes unnecessary overhead,
    // but it's harmless either way (5 extra seconds on an already slow ingest phase).
    const results = await Promise.all(
      QUERIES.map((q, i) => new Promise<any[]>(r => setTimeout(() => searchQuery(q, dateFrom).then(r), i * 1100)))
    )
    const allPapers = results.flat()

    // Deduplicate by Semantic Scholar paperId
    const seen = new Set<string>()
    const unique = allPapers.filter(p => {
      if (!p.paperId || seen.has(p.paperId)) return false
      seen.add(p.paperId)
      return true
    })

    return unique
      .filter(p => (p.influentialCitationCount ?? 0) >= 1)
      .sort((a, b) => (b.influentialCitationCount ?? 0) - (a.influentialCitationCount ?? 0))
      .slice(0, 40)
      .map(p => {
        // Prefer the canonical arxiv URL for dedup with items already in the DB from arxiv fetcher
        const arxivId = p.externalIds?.ArXiv
        const url = arxivId
          ? `https://arxiv.org/abs/${arxivId}`
          : (p.url ?? `https://www.semanticscholar.org/paper/${p.paperId}`)

        return {
          id: stableId(p.paperId),
          source: 'semanticscholar',
          title: p.title ?? '',
          url,
          summary: (p.abstract ?? '').slice(0, 600),
          raw_content: p.abstract ?? '',
          published_at: safeIsoDate(p.publicationDate),
          fetched_at: now,
          topic_tags: ['research'],
          velocity_score: 0,
          is_read: 0,
        } as FeedItem
      })
  } catch (err) {
    console.error('[semanticscholar] fetch failed:', err)
    return []
  }
}
