import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL_FAST } from '../claude'
import { safeJSON } from '../utils'
import { promoteDetectedModels } from './models'

export interface BenchmarkUpdateResult {
  seeded: number
  updated: number
  sources: string[]
  errors: string[]
}

// ── Baseline seed ─────────────────────────────────────────────────────────────
// Writes each model's existing benchmark values to benchmark_snapshots once,
// so the history chart has a starting point before any external scraping runs.

async function seedBaselineSnapshots(now: string): Promise<number> {
  const { rows: modelRows } = await db.execute(
    `SELECT slug, benchmarks FROM ai_models WHERE benchmarks IS NOT NULL AND benchmarks != '{}'`
  )

  // Pre-load all already-seeded pairs in one query to avoid N+1 SELECTs
  const { rows: seededRows } = await db.execute(
    `SELECT model_slug, metric FROM benchmark_snapshots WHERE source = 'seed'`
  )
  const seededSet = new Set((seededRows as any[]).map(r => `${r.model_slug}:${r.metric}`))

  const inserts: { sql: string; args: unknown[] }[] = []

  for (const row of modelRows as any[]) {
    const benches: Record<string, number> = safeJSON(row.benchmarks ?? '{}', {})
    for (const [metric, value] of Object.entries(benches)) {
      if (typeof value !== 'number') continue
      if (seededSet.has(`${row.slug}:${metric}`)) continue
      inserts.push({
        sql: `INSERT INTO benchmark_snapshots (id, model_slug, metric, value, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), row.slug, metric, value, 'seed', now],
      })
    }
  }

  if (inserts.length > 0) await db.batch(inserts as any)
  return inserts.length
}

// ── Artificial Analysis ───────────────────────────────────────────────────────
// Fetches their SSR models page and uses Claude to extract Intelligence Index
// scores, matching each AA model name to our internal slugs.

async function fetchArtificialAnalysis(
  models: { slug: string; name: string }[],
  now: string
): Promise<{ updated: number; error?: string }> {
  let html: string
  try {
    const r = await fetch('https://artificialanalysis.ai/models', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(20000),
    })
    if (!r.ok) return { updated: 0, error: `HTTP ${r.status}` }
    html = await r.text()
  } catch (e) {
    return { updated: 0, error: String(e).slice(0, 120) }
  }

  const modelList = models.map(m => `${m.slug} | ${m.name}`).join('\n')

  let text = ''
  try {
    const resp = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Extract all model names and their Intelligence Index scores from the HTML below.
Then match each model to the closest entry in this slug list (slug | name):
${modelList}

Return ONLY a JSON array with no extra text:
[{"slug": "our-model-slug", "score": 60}]

Rules:
- Only include entries where you found a score and are confident in the slug match
- Omit any model you can't match to a slug above
- score is a number (the Intelligence Index value)

HTML (first 35000 chars):
${html.slice(0, 35000)}`,
      }],
    })
    text = resp.content[0].type === 'text' ? resp.content[0].text : ''
  } catch (e) {
    return { updated: 0, error: `Claude: ${String(e).slice(0, 120)}` }
  }

  const match = text.match(/\[[\s\S]*?\]/)
  if (!match) return { updated: 0, error: 'no JSON array in Claude response' }

  const results: { slug: string; score: number }[] = safeJSON(match[0], [])
  if (!Array.isArray(results) || results.length === 0) return { updated: 0 }

  const knownSlugs = new Set(models.map(m => m.slug))
  const inserts: { sql: string; args: unknown[] }[] = []

  for (const { slug, score } of results) {
    // Guard against wrong type, out-of-range, or non-finite values from Claude
    if (!knownSlugs.has(slug) || typeof score !== 'number' || score < 0 || score > 200 || !isFinite(score)) continue
    inserts.push({
      sql: `INSERT INTO benchmark_snapshots (id, model_slug, metric, value, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [crypto.randomUUID(), slug, 'intelligence_index', Math.round(score * 10) / 10, 'artificial_analysis', now],
    })
  }

  if (inserts.length > 0) await db.batch(inserts as any)
  return { updated: inserts.length }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function updateBenchmarks(): Promise<BenchmarkUpdateResult> {
  const now = new Date().toISOString()
  let seeded = 0
  let updated = 0
  const sources: string[] = []
  const errors: string[] = []

  // 1. Seed any model+metric combination that has no snapshot yet
  try {
    seeded = await seedBaselineSnapshots(now)
    if (seeded > 0) sources.push(`seed(${seeded})`)
  } catch (e) {
    errors.push(`seed: ${String(e).slice(0, 120)}`)
  }

  // 2. Artificial Analysis — Intelligence Index composite score per model
  try {
    const { rows: modelRows } = await db.execute(
      `SELECT slug, name FROM ai_models WHERE status != 'deprecated'`
    )
    const models = (modelRows as any[]).map(r => ({ slug: r.slug as string, name: r.name as string }))
    const { updated: aaUpdated, error } = await fetchArtificialAnalysis(models, now)

    if (error) {
      errors.push(`artificial_analysis: ${error}`)
    } else {
      updated += aaUpdated
      sources.push(`artificial_analysis(${aaUpdated})`)
    }
  } catch (e) {
    errors.push(`artificial_analysis: ${String(e).slice(0, 120)}`)
  }

  // 3. Promote any detected-* preview stubs to canonical slugs
  try {
    await promoteDetectedModels()
  } catch (e) {
    errors.push(`promote: ${String(e).slice(0, 120)}`)
  }

  // Record this run in source_runs so the health endpoint tracks it
  try {
    await db.execute({
      sql: `INSERT INTO source_runs (source, fetched_at, item_count) VALUES (?, ?, ?)`,
      args: ['benchmark-sync', now, seeded + updated],
    })
  } catch (e) {
    console.error('[benchmarks] source_runs insert failed:', e)
  }

  return { seeded, updated, sources, errors }
}
