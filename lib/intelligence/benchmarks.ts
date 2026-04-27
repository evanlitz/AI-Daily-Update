import crypto from 'crypto'
import db from '../db'

// Maps external leaderboard model IDs → our slugs
const SLUG_MAP: Record<string, string> = {
  // OpenAI
  'gpt-4o':                     'gpt-4o',
  'gpt-4o-2024-11-20':          'gpt-4o',
  'gpt-4o-mini':                'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18':     'gpt-4o-mini',
  'o1':                         'o1',
  'o1-2024-12-17':              'o1',
  'o1-mini':                    'o1-mini',
  'o3':                         'o3',
  'o3-mini':                    'o3-mini',
  // Anthropic
  'claude-3-5-sonnet-20241022':  'claude-3-5-sonnet',
  'claude-3-5-sonnet':           'claude-3-5-sonnet',
  'claude-3-5-haiku-20241022':   'claude-3-5-haiku',
  'claude-3-opus-20240229':      'claude-3-opus',
  'claude-3-7-sonnet-20250219':  'claude-3-7-sonnet',
  'claude-opus-4-5':             'claude-4-opus',
  'claude-sonnet-4-5':           'claude-4-sonnet',
  // Google
  'gemini-1.5-pro':             'gemini-1-5-pro',
  'gemini-1.5-pro-002':         'gemini-1-5-pro',
  'gemini-2.0-flash':           'gemini-2-0-flash',
  'gemini-2.5-pro':             'gemini-2-5-pro',
  // Meta
  'llama-3.1-405b-instruct':    'llama-3-1-405b',
  'llama-3.1-70b-instruct':     'llama-3-1-70b',
  'llama-3.3-70b-instruct':     'llama-3-3-70b',
  // Mistral
  'mistral-large-2411':         'mistral-large-2',
  // DeepSeek
  'deepseek-v3':                'deepseek-v3',
  'deepseek-v3-0324':           'deepseek-v3',
  'deepseek-r1':                'deepseek-r1',
}

function resolveSlug(rawName: string): string | null {
  const direct = SLUG_MAP[rawName]
  if (direct) return direct
  const lower = rawName.toLowerCase()
  for (const [key, slug] of Object.entries(SLUG_MAP)) {
    if (key.toLowerCase() === lower) return slug
  }
  return null
}

export interface BenchmarkUpdateResult {
  updated: number
  sources: string[]
  errors: string[]
}

export async function updateBenchmarks(): Promise<BenchmarkUpdateResult> {
  const now = new Date().toISOString()
  let updated = 0
  const sources: string[] = []
  const errors: string[] = []

  // Load all models from DB into a slug→row map
  const { rows: modelRows } = await db.execute(`SELECT id, slug, benchmarks FROM ai_models`)
  const modelsBySlug = new Map((modelRows as any[]).map(r => [r.slug as string, r as any]))

  async function persistScore(slug: string, metric: string, value: number, source: string) {
    const model = modelsBySlug.get(slug)
    if (!model) return

    let benchmarks: Record<string, number>
    try { benchmarks = JSON.parse(model.benchmarks ?? '{}') } catch { benchmarks = {} }
    benchmarks[metric] = Math.round(value * 10) / 10

    await db.execute({
      sql: `UPDATE ai_models SET benchmarks = ?, updated_at = ? WHERE slug = ?`,
      args: [JSON.stringify(benchmarks), now, slug],
    })
    await db.execute({
      sql: `INSERT INTO benchmark_snapshots (id, model_slug, metric, value, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [crypto.randomUUID(), slug, metric, value, source, now],
    })
    // Update local cache so repeated calls in same run are consistent
    model.benchmarks = JSON.stringify(benchmarks)
    updated++
  }

  // ── EvalPlus (HumanEval++) ──────────────────────────────────────────────
  try {
    const r = await fetch('https://evalplus.github.io/leaderboard.json', {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'ai-pulse-dashboard/1.0' },
    })
    if (r.ok) {
      const data: Record<string, any> = await r.json()
      for (const [rawName, results] of Object.entries(data)) {
        const slug = resolveSlug(rawName)
        if (!slug) continue
        const val = results?.humaneval_plus ?? results?.humaneval ?? results?.pass_at_1
        if (typeof val === 'number') await persistScore(slug, 'humaneval', val, 'evalplus')
      }
      sources.push('EvalPlus')
    } else {
      errors.push(`EvalPlus HTTP ${r.status}`)
    }
  } catch (e) {
    errors.push(`EvalPlus: ${String(e).slice(0, 100)}`)
  }

  // ── BigCode (SWE-bench) via HuggingFace Datasets API ───────────────────
  try {
    const r = await fetch(
      'https://datasets-server.huggingface.co/rows?dataset=princeton-nlp%2FSWE-bench_Verified&config=default&split=test&offset=0&limit=1',
      { signal: AbortSignal.timeout(8000) }
    )
    // This endpoint just validates accessibility; actual leaderboard data
    // isn't available in a simple JSON — skip to avoid bad data.
    if (!r.ok) errors.push(`SWE-bench HF: HTTP ${r.status}`)
  } catch {}

  return { updated, sources, errors }
}
