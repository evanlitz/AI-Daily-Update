import { fetchArxiv } from '@/lib/sources/arxiv'
import { fetchHackerNews } from '@/lib/sources/hackernews'
import { fetchRSS } from '@/lib/sources/rss'
import { fetchGithubTrending } from '@/lib/sources/github'
import { fetchGithubTop } from '@/lib/sources/github_top'
import { fetchHuggingFace } from '@/lib/sources/huggingface'
import { fetchDatasets } from '@/lib/sources/datasets'
import { fetchKaggleDatasets } from '@/lib/sources/kaggle'
import { fetchYoutube } from '@/lib/sources/youtube'
import { fetchPapersWithCode } from '@/lib/sources/paperswithcode'
import { fetchSemanticScholar } from '@/lib/sources/semanticscholar'
import { fetchGithubReleases } from '@/lib/sources/github_releases'
import { fetchHFModels } from '@/lib/sources/hf_models'

export const maxDuration = 120

type SourceCheck = {
  source: string
  ok: boolean
  durationMs: number
  itemCount: number
  sampleTitle: string | null
  error: string | null
}

// Each entry: a unique label + a thunk that calls the real fetcher with no DB dependency.
// fetchYoutube normally takes a knownUrls set from the DB to skip already-seen videos —
// passed empty here so the health check always exercises real feed parsing + transcripts.
const CHECKS: { source: string; run: () => Promise<unknown[]> }[] = [
  { source: 'arxiv', run: fetchArxiv },
  { source: 'hackernews', run: fetchHackerNews },
  { source: 'rss', run: fetchRSS },
  { source: 'github', run: fetchGithubTrending },
  { source: 'github_top', run: fetchGithubTop },
  { source: 'huggingface', run: fetchHuggingFace },
  { source: 'datasets', run: fetchDatasets },
  { source: 'kaggle', run: fetchKaggleDatasets },
  { source: 'youtube', run: () => fetchYoutube(new Set()) },
  { source: 'paperswithcode', run: fetchPapersWithCode },
  { source: 'semanticscholar', run: fetchSemanticScholar },
  { source: 'github_releases', run: fetchGithubReleases },
  { source: 'hf_models', run: fetchHFModels },
]

function sampleLabel(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  const label = o.title ?? o.full_name ?? o.name
  return typeof label === 'string' ? label.slice(0, 120) : null
}

async function runCheck(check: { source: string; run: () => Promise<unknown[]> }): Promise<SourceCheck> {
  const start = Date.now()
  try {
    const items = await check.run()
    return {
      source: check.source,
      ok: true,
      durationMs: Date.now() - start,
      itemCount: Array.isArray(items) ? items.length : 0,
      sampleTitle: Array.isArray(items) && items.length > 0 ? sampleLabel(items[0]) : null,
      error: null,
    }
  } catch (err) {
    return {
      source: check.source,
      ok: false,
      durationMs: Date.now() - start,
      itemCount: 0,
      sampleTitle: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const only = searchParams.get('source')

  const checks = only ? CHECKS.filter(c => c.source === only) : CHECKS
  if (only && checks.length === 0) {
    return Response.json({ error: `Unknown source "${only}". Valid: ${CHECKS.map(c => c.source).join(', ')}` }, { status: 400 })
  }

  const results = await Promise.all(checks.map(runCheck))
  results.sort((a, b) => a.source.localeCompare(b.source))

  const summary = {
    total: results.length,
    ok: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    zeroItems: results.filter(r => r.ok && r.itemCount === 0).length,
    slowest: results.length ? results.reduce((a, b) => (b.durationMs > a.durationMs ? b : a)).source : null,
  }

  return Response.json({ checkedAt: new Date().toISOString(), summary, results })
}
