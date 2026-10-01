import Parser from 'rss-parser'
import he from 'he'
import crypto from 'crypto'
import type { FeedItem } from '../types'
import { extractPageContent } from '../extract-content'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const parser = new Parser({
  customFields: { item: ['content:encoded'] },
  headers: { 'User-Agent': USER_AGENT },
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
  { url: 'https://deepmind.google/blog/rss.xml',                         source: 'rss:deepmind',            tags: ['research', 'models'] },
  { url: 'https://mistral.ai/rss.xml',                                   source: 'rss:mistral',             tags: ['models', 'industry'] },
  { url: 'https://thinkingmachines.ai/blog/index.xml',                   source: 'rss:thinking-machines',   tags: ['research', 'models'] },

  // ── Scraped Lab Feeds ────────────────────────────────────────────────────────
  // anthropic.com and ai.meta.com publish no usable RSS (anthropic has none; meta's
  // /blog/rss/ 400s at their edge) and Qwen has none either, so these come from
  // third-party scrapers rebuilt on GitHub Actions. The Turing Institute repo
  // (alan-turing-institute/ai-rss-feeds) fails its build on near-empty output
  // rather than publishing a silently empty feed; AI RSS Network
  // (yuanxianh/rss-feeds) rebuilds hourly. Both Anthropic feeds list oldest-first
  // and carry no description — fetchFeed sorts and backfills page content for that.
  { url: 'https://raw.githubusercontent.com/alan-turing-institute/ai-rss-feeds/main/feeds/anthropic-news.xml',     source: 'rss:anthropic-news',     tags: ['models', 'industry'] },
  { url: 'https://raw.githubusercontent.com/alan-turing-institute/ai-rss-feeds/main/feeds/anthropic-research.xml', source: 'rss:anthropic-research', tags: ['research'] },
  { url: 'https://yuanxianh.github.io/rss-feeds/meta_ai_research.xml',   source: 'rss:meta-ai-research',    tags: ['research'] },
  { url: 'https://yuanxianh.github.io/rss-feeds/qwen_research.xml',      source: 'rss:qwen',                tags: ['models', 'research'] },

  // ── Big Tech AI Blogs ────────────────────────────────────────────────────────
  // rss:google-ai (blog.google's broader "innovation and AI" category) dropped:
  // 9.4% accept rate over 32 screened items — it's Google's general innovation
  // blog, not an AI-specific one, and deepmind's own feed already covers
  // Google's actual model/research news far more precisely.
  { url: 'https://research.google/blog/rss',                             source: 'rss:google-research',     tags: ['research'] },
  { url: 'https://www.microsoft.com/en-us/research/blog/feed/',          source: 'rss:microsoft-research',  tags: ['research'] },
  { url: 'https://news.microsoft.com/source/topics/ai/feed/',            source: 'rss:microsoft-ai',        tags: ['industry', 'tools'] },
  { url: 'https://developer.nvidia.com/blog/feed/',                      source: 'rss:nvidia',              tags: ['infrastructure', 'tools'] },
  { url: 'https://machinelearning.apple.com/rss.xml',                    source: 'rss:apple-ml',            tags: ['research', 'models'] },
  { url: 'https://aws.amazon.com/blogs/machine-learning/feed/',          source: 'rss:aws-ml',              tags: ['infrastructure', 'tools'] },

  // ── Curated AI Newsletters ───────────────────────────────────────────────────
  { url: 'https://importai.substack.com/feed',                           source: 'rss:import-ai',           tags: ['industry'] },
  { url: 'https://www.interconnects.ai/feed',                            source: 'rss:interconnects',       tags: ['research'] },
  { url: 'https://sebastianraschka.com/rss_feed.xml',                    source: 'rss:raschka',             tags: ['research'] },
  // rss:the-gradient dropped: dormant — newest post 224 days old as of 2026-10-01,
  // zero items fetched in source_runs history.
  { url: 'https://newsletter.theaiedge.io/feed',                         source: 'rss:ai-edge',             tags: ['research', 'tools'] },
  { url: 'https://www.latent.space/feed',                                source: 'rss:latent-space',        tags: ['research', 'tools'] },
  { url: 'https://tldr.tech/api/rss/ai',                                 source: 'rss:tldr-ai',             tags: ['industry', 'tools'] },
  // /atom/entries/ (long-form posts only) instead of /atom/everything/: the full
  // feed's blogmarks/quotes ran ~60 items per 2 weeks at a 15% accept rate.
  { url: 'https://simonwillison.net/atom/entries/',                      source: 'rss:simon-willison',      tags: ['tools'] },
  { url: 'https://huggingface.co/blog/feed.xml',                         source: 'rss:huggingface-blog',    tags: ['tools', 'models'] },
  { url: 'https://www.oneusefulthing.org/feed',                          source: 'rss:one-useful-thing',    tags: ['industry'] },
  { url: 'https://thezvi.substack.com/feed',                             source: 'rss:zvi',                 tags: ['industry', 'research'] },
  { url: 'https://www.bensbites.com/feed',                               source: 'rss:bens-bites',          tags: ['industry'] },

  // ── AI Safety / Alignment ────────────────────────────────────────────────────
  // Alignment Forum: the primary venue for alignment research discourse —
  // interpretability, RLHF theory, agent foundations. Not covered by any tech press feed.
  { url: 'https://www.alignmentforum.org/feed.xml',                      source: 'rss:alignment-forum',     tags: ['research', 'industry'] },

  // ── Academic / Research Labs ─────────────────────────────────────────────────
  { url: 'https://bair.berkeley.edu/blog/feed.xml',                      source: 'rss:bair',                tags: ['research'] },
  // rss:stanford-hai dropped: hai.stanford.edu/news/rss.xml now serves the HTML
  // site (Next.js rewrite), no feed exists anymore.
  { url: 'https://news.mit.edu/rss/topic/artificial-intelligence2',      source: 'rss:mit-news',            tags: ['research'] },

  // ── Global AI Coverage ───────────────────────────────────────────────────────
  // Recode China AI: direct coverage of Chinese labs (DeepSeek, Qwen, Zhipu, MiniMax,
  // etc.) — none of the labs themselves publish English RSS. Replaced rss:chinatalk,
  // which hit a 9% accept rate over 128 items: mostly general US-China policy, not AI.
  { url: 'https://recodechinaai.substack.com/feed',                      source: 'rss:recode-china-ai',     tags: ['industry', 'research'] },

  // ── Model Labs / Infra ───────────────────────────────────────────────────────
  { url: 'https://www.together.ai/blog/rss.xml',                         source: 'rss:together-ai',         tags: ['models', 'infrastructure'] },
  { url: 'https://stability.ai/news-updates?format=rss',                  source: 'rss:stability-ai',        tags: ['models'] },

  // ── Tech News ────────────────────────────────────────────────────────────────
  // The Verge (rss:the-verge) dropped: 12.1% accept rate over 33 screened items —
  // its general tech-culture coverage was diluting the feed, not filling a gap
  // (regulatory/IP-dispute stories it does carry already surface via Ars/Wired/
  // The Decoder). Measured via screening_stats, see lib/intelligence/hooks.ts.
  // Wired AI: investigative/longform journalism — deep company profiles, policy pieces.
  // Different cadence from TechCrunch/Ars which are news-cycle oriented.
  { url: 'https://www.wired.com/feed/tag/ai/latest/rss',                  source: 'rss:wired-ai',            tags: ['industry'] },
  // IEEE Spectrum AI: engineering and hardware angle — inference chips, data center
  // builds, practical deployment. Underrepresented in the current software-skewed mix.
  { url: 'https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss', source: 'rss:ieee-spectrum-ai', tags: ['infrastructure', 'research'] },
  // SemiAnalysis: the most-cited chips/compute/datacenter deep-dive newsletter in AI —
  // GPU supply, training cluster economics, export-control fallout. Complements IEEE
  // Spectrum's engineering angle with the compute-economics angle.
  // www.semianalysis.com/feed 301s to a stale feed — the newsletter moved to its own subdomain.
  { url: 'https://newsletter.semianalysis.com/feed',                     source: 'rss:semianalysis',        tags: ['infrastructure', 'industry'] },
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', source: 'rss:techcrunch-ai',      tags: ['industry'] },
  // AI topic feed, not the whole-site /feed/ (17% accept rate over 219 items).
  { url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', source: 'rss:mit-tech-review', tags: ['research'] },
  // rss:venturebeat-ai dropped: persistent HTTP 429 to datacenter IPs, last item 2026-09-03.
  { url: 'https://www.marktechpost.com/feed/',                            source: 'rss:marktechpost',       tags: ['research', 'industry'] },
  // rss:techcrunch-venture dropped: 8.1% accept rate over 99 screened items, the
  // lowest of any RSS source — general VC/funding news rarely touches AI, and
  // rss:techcrunch-ai already covers this outlet's actual AI stories.
  // No free primary-source feed exists for anthropic/cohere/meta-ai (see note above) —
  // these two news aggregators pick up their announcements editorially instead.
  { url: 'https://the-decoder.com/feed/',                                  source: 'rss:the-decoder',         tags: ['models', 'industry'] },
  { url: 'https://arstechnica.com/ai/feed/',                               source: 'rss:ars-technica-ai',     tags: ['industry'] },
]

export const RSS_SOURCE_NAMES = FEEDS.map(f => f.source)

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
}

const CUTOFF_DAYS = 14

// Some upstream feeds ship genuinely malformed XML — e.g. apple-ml's feed has a raw
// unescaped & in a title ("...Machine Learning & AI 2026") that breaks strict XML
// parsing. Escaping any & not already part of a valid entity fixes this class of bug
// without needing per-feed special-casing; well-formed feeds are unaffected (no-op).
function sanitizeXmlEntities(xml: string): string {
  return xml.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
}

async function fetchFeed(feed: typeof FEEDS[number]): Promise<FeedItem[]> {
  try {
    const res = await Promise.race([
      fetch(feed.url, { headers: { 'User-Agent': USER_AGENT } }),
      timeout(8000),
    ])
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = sanitizeXmlEntities(await res.text())
    const result = await parser.parseString(xml)
    const now = new Date().toISOString()
    const cutoff = Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000

    // Sort newest-first before the cap: some feeds (e.g. the scraped Anthropic ones)
    // list oldest-first, so slicing first would keep only years-old items and the
    // date filter below would then drop all of them. isoDate is ISO-8601, so string
    // order is date order; undated items sort last.
    const items = [...(result.items ?? [])]
      .sort((a: any, b: any) => (b.isoDate ?? '').localeCompare(a.isoDate ?? ''))
      .slice(0, 20) // cap at 20 per feed before date filtering
      .map((item: any) => {
        // summary: Atom feeds (e.g. simon-willison) carry their text in <summary>.
        const rawContent = item['content:encoded'] ?? item.content ?? item.contentSnippet ?? item.summary ?? ''
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

    // Title-only feeds (hf-blog, tldr-ai, the scraped Anthropic ones) would otherwise
    // be screened on the headline alone — same page-content backfill as hackernews.ts.
    const enriched = await Promise.all(items.map(async item => {
      if (item.raw_content || !item.url) return item
      const content = await extractPageContent(item.url)
      return content ? { ...item, raw_content: content.slice(0, 1500) } : item
    }))

    return enriched as FeedItem[]
  } catch (err) {
    console.error(`[rss:${feed.source}] fetch failed:`, err)
    return []
  }
}

export async function fetchRSS(): Promise<FeedItem[]> {
  const results = await Promise.all(FEEDS.map(fetchFeed))
  return results.flat()
}
