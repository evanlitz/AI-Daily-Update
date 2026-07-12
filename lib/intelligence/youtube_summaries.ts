import { anthropic, MODEL_FAST } from '../claude'
import db from '../db'
import { safeJSON } from '../utils'

const SYSTEM_PROMPT = `You extract concrete, practical takeaways from AI/ML video transcripts for a self-taught developer audience.

For each video write 3-5 bullet points. Each bullet must be:
- Specific: a technique, benchmark result, tool, or actionable insight actually stated in the transcript
- Concise: one sentence, under 130 characters
- Grounded: do not infer or add things not present in the transcript

Avoid: generic praise, hype, filler phrases like "the speaker discusses..." or "this is important because..."

Good: "Speculative decoding cuts inference latency ~40% by running a small draft model in parallel with the main model"
Good: "vLLM 0.4 prefix caching reduces time-to-first-token by 60% on prompts with shared prefixes"
Bad: "The video covers exciting new developments in large language models"`

// Batches are sequential Claude calls (each individually capped at 60s by
// claude.ts's client timeout) — up to 4 batches with no cutoff could run 240s,
// which alongside fetch-intel's other concurrent phase-1 tasks risked exceeding
// the route's 300s maxDuration. Same "stop and let the next run pick up the
// rest" shape as hooks.ts's SCREENING_TIME_BUDGET_MS.
const SUMMARY_TIME_BUDGET_MS = 60_000

export async function generateYoutubeSummaries(): Promise<void> {
  const { rows } = await db.execute({
    sql: `SELECT id, title, source, raw_content FROM feed_items
          WHERE source LIKE 'youtube:%' AND (summary IS NULL OR summary = '') AND screened = 1
          ORDER BY fetched_at DESC LIMIT 20`,
    args: [],
  })

  if (rows.length === 0) return

  const items = rows as any[]
  const BATCH = 5
  const loopStart = Date.now()

  for (let i = 0; i < items.length; i += BATCH) {
    if (Date.now() - loopStart > SUMMARY_TIME_BUDGET_MS) {
      console.warn(`[youtube-summaries] time budget hit — ${items.length - i} item(s) left for next run`)
      break
    }
    const batch = items.slice(i, i + BATCH)

    const prompt = batch.map((item, n) => {
      const transcript = String(item.raw_content ?? '').slice(0, 4000)
      return `${n + 1}. Title: ${item.title}\nSource: ${item.source}\nTranscript:\n${transcript}`
    }).join('\n\n---\n\n')

    try {
      const resp = await anthropic.messages.create({
        model: MODEL_FAST,
        max_tokens: 1500,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: `Extract key takeaways for each video. Return ONLY a JSON array (one entry per video, in order):\n[{"n":1,"summary":"- Takeaway one\\n- Takeaway two\\n- Takeaway three"},{"n":2,"summary":"..."},...]\n\n${prompt}`,
        }],
      })

      const text = resp.content[0].type === 'text' ? resp.content[0].text : ''
      const match = text.match(/\[[\s\S]*\]/)
      if (!match) { console.error('[youtube-summaries] no JSON in response'); continue }

      const parsed: { n: number; summary: string }[] = safeJSON(match[0], [])
      let updated = 0
      for (const { n, summary } of parsed) {
        const item = batch[n - 1]
        if (!item || !summary) continue
        await db.execute({
          sql: `UPDATE feed_items SET summary = ? WHERE id = ?`,
          args: [summary.trim().slice(0, 1000), item.id],
        })
        updated++
      }
      console.log(`[youtube-summaries] wrote ${updated} summaries`)
    } catch (err) {
      console.error('[youtube-summaries] error:', err)
    }
  }
}
