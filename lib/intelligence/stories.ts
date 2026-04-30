import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL, MODEL_FAST } from '../claude'
import { getMondayISO, safeJSON } from '../utils'
import { applyStoryEvidence } from './predictions'

const PINNED_SEEDS = [
  {
    title: 'OpenAI Developments',
    category: 'market',
    current_summary: 'Tracking OpenAI model releases, product launches, policy decisions, and competitive moves.',
    watch_for: 'New model releases, pricing changes, safety announcements, leadership news.',
  },
  {
    title: 'Anthropic Developments',
    category: 'safety',
    current_summary: 'Tracking Anthropic model releases, Constitutional AI updates, safety research, and Claude ecosystem.',
    watch_for: 'New Claude versions, safety research publications, policy stances, enterprise moves.',
  },
  {
    title: 'Google DeepMind',
    category: 'capability',
    current_summary: 'Tracking Gemini releases, DeepMind research, and Google\'s AI infrastructure investments.',
    watch_for: 'Gemini updates, breakthrough research papers, TPU/infrastructure announcements.',
  },
  {
    title: 'Open Source Models',
    category: 'tooling',
    current_summary: 'Tracking the open-weight model ecosystem: Meta Llama, Mistral, DeepSeek, and community fine-tunes.',
    watch_for: 'New open releases closing the gap with closed models, licensing changes, community adoption.',
  },
  {
    title: 'AI Safety Landscape',
    category: 'safety',
    current_summary: 'Tracking AI safety research, alignment progress, regulatory moves, and lab safety commitments.',
    watch_for: 'New alignment techniques, policy developments, incidents, lab red-team findings.',
  },
]

const MAX_ACTIVE = 20

// No `g` flag — avoids stateful lastIndex across filter iterations
const ENTITY_PATTERN = /\b(OpenAI|Anthropic|Google|DeepMind|Meta|Microsoft|Apple|Amazon|xAI|Elon Musk|Sam Altman|Dario Amodei|Mistral|DeepSeek|Cohere|Inflection|Stability|Runway|Midjourney|GPT-?[345o\d]+|Claude\s?[\d.]+|Gemini\s?[\d.]+|Llama\s?[\d]+|o[134]|Grok\s?[\d.]*|Phi-[\d.]+|Qwen[\d\s.]*|Falcon[\d\s]*|DALL-?E|Sora|SWE-bench|MMLU|ARC-AGI|HumanEval|GPQA|alignment|jailbreak|AGI|superintelligence|regulation|EU AI Act|executive order|copyright|open.source|open.weight|reasoning|multimodal|agent|autonomous|computer use|benchmark|context window)\b/i

function itemMatchesAnyThread(text: string, threadTitles: string[]): boolean {
  if (ENTITY_PATTERN.test(text)) return true
  const lower = text.toLowerCase()
  return threadTitles.some(t =>
    t.toLowerCase().split(/\s+/).filter(w => w.length > 4).some(w => lower.includes(w))
  )
}

function loadThreads() {
  return db.execute(
    `SELECT id, title, category, status, current_summary, watch_for, is_pinned, last_updated
     FROM story_threads WHERE status = 'active' ORDER BY last_updated DESC`
  )
}

async function loadRecentEvents(): Promise<Map<string, { week: string; text: string; source: string }[]>> {
  const { rows } = await db.execute(`
    WITH ranked AS (
      SELECT thread_id, update_text, week, COALESCE(source, 'pipeline') as source,
             ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY created_at DESC) AS rn
      FROM story_events
    )
    SELECT thread_id, update_text, week, source FROM ranked WHERE rn <= 2
  `)
  const map = new Map<string, { week: string; text: string; source: string }[]>()
  for (const e of rows as any[]) {
    const list = map.get(e.thread_id) ?? []
    list.push({ week: e.week, text: (e.update_text as string).slice(0, 150), source: e.source as string })
    map.set(e.thread_id, list)
  }
  return map
}

async function loadManualNotes(): Promise<Map<string, string>> {
  const cutoff = new Date(Date.now() - 14 * 24 * 3600_000).toISOString()
  const { rows } = await db.execute({
    sql: `SELECT thread_id, update_text FROM story_events
          WHERE source = 'manual' AND created_at >= ?
          ORDER BY created_at DESC`,
    args: [cutoff],
  })
  const map = new Map<string, string>()
  for (const e of rows as any[]) {
    if (!map.has(e.thread_id as string)) {
      map.set(e.thread_id as string, (e.update_text as string).slice(0, 200))
    }
  }
  return map
}

export async function seedPinnedStories(): Promise<void> {
  const { rows } = await db.execute(
    `SELECT COUNT(*) as c FROM story_threads WHERE is_pinned = 1`
  )
  if ((rows[0] as any).c >= PINNED_SEEDS.length) return

  const now = new Date().toISOString()
  const placeholders = PINNED_SEEDS.map(() =>
    `(?, ?, ?, 'active', ?, ?, 1, ?, ?)`
  ).join(', ')
  const args = PINNED_SEEDS.flatMap(s => [
    crypto.randomUUID(), s.title, s.category, s.current_summary, s.watch_for, now, now,
  ])
  await db.execute({
    sql: `INSERT OR IGNORE INTO story_threads
            (id, title, category, status, current_summary, watch_for, is_pinned, first_seen, last_updated)
          VALUES ${placeholders}`,
    args,
  })
}

async function pruneOldThreads(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  await db.execute({
    sql: `UPDATE story_threads SET status = 'resolved', resolved_at = ?
          WHERE is_pinned = 0 AND status = 'active' AND last_updated < ?`,
    args: [new Date().toISOString(), cutoff],
  })
}

async function archiveOldest(): Promise<void> {
  await db.execute({
    sql: `UPDATE story_threads SET status = 'resolved', resolved_at = ?
          WHERE id = (
            SELECT id FROM story_threads
            WHERE status = 'active' AND is_pinned = 0
            ORDER BY last_updated ASC LIMIT 1
          )`,
    args: [new Date().toISOString()],
  })
}

export async function updateStoryThreads(
  feedItems: { id: string; title: string; summary?: string | null; velocity_score?: number | null }[]
): Promise<void> {
  await seedPinnedStories()

  const [{ rows: threadRows }, recentEvents, manualNotes] = await Promise.all([
    loadThreads(),
    loadRecentEvents(),
    loadManualNotes(),
  ])
  const threads = threadRows as any[]
  const threadTitles = threads.map(t => t.title as string)

  const relevant = feedItems.filter(item => {
    const text = `${item.title} ${item.summary ?? ''}`
    return (item.velocity_score ?? 0) >= 0.1 || itemMatchesAnyThread(text, threadTitles)
  }).slice(0, 60)

  if (!relevant.length) return

  const week = getMondayISO()
  // Use integer refs instead of UUIDs — saves ~640 tokens and avoids hallucination risk
  // Include last 2 weekly events per thread so Claude can identify follow-up developments
  const threadContext = threads.map((t, i) => ({
    ref: i,
    title: t.title,
    summary: (t.current_summary ?? '').slice(0, 250),
    watch_for: (t.watch_for ?? '').slice(0, 150),
    recent_events: recentEvents.get(t.id) ?? [],
    manual_note: manualNotes.get(t.id) ?? null,
  }))
  // item.id never used by Claude (it returns item_idxs integers) — drop it
  const itemContext = relevant.map((item, i) => ({
    idx: i,
    title: item.title,
    summary: (item.summary ?? '').slice(0, 200),
  }))

  const systemPrompt = `You are an AI industry analyst maintaining a living notebook of ongoing stories about AI development. Your job is to:
1. Match relevant news items to existing story threads
2. Identify genuinely new stories emerging from the feed (not just one-off events — real ongoing narratives)
3. Update the current state of each thread

Be selective: not every item deserves a thread. A story needs multiple future developments to be worth tracking. A single product announcement is an event, not a story. A competitive dynamic, an ongoing safety debate, a technology adoption curve — those are stories.`

  const userPrompt = `Current story threads (ref = integer index; recent_events = last 1-2 weekly updates; manual_note = human curator annotation, treat as high-priority signal):
${JSON.stringify(threadContext, null, 2)}

New feed items (idx = integer index to use in output):
${JSON.stringify(itemContext, null, 2)}

Output a JSON object with this exact shape:
{
  "thread_updates": [
    {
      "thread_ref": 0,
      "update_text": "One to two sentences describing what happened this week relevant to this thread. Reference prior developments from recent_events when the new item is a continuation or reversal. If manual_note exists, prioritize coverage that addresses it.",
      "significance": "low|medium|high",
      "item_idxs": [0, 3, 7],
      "new_summary": "Updated one-paragraph synthesis of where this story stands now.",
      "new_watch_for": "Updated sentence about what to look for next."
    }
  ],
  "new_threads": [
    {
      "title": "Short descriptive story title",
      "category": "capability|safety|policy|market|tooling|research",
      "update_text": "What happened this week that opens this story.",
      "significance": "low|medium|high",
      "item_idxs": [12, 15],
      "current_summary": "One paragraph on what this story is about and where it stands.",
      "watch_for": "One sentence on what the next chapter looks like."
    }
  ]
}

Rules:
- Only include thread_updates for threads that have RELEVANT new developments this week. Skip threads with nothing new.
- Only propose new_threads for genuinely emerging multi-week narratives, not one-off events.
- Limit new_threads to 3 maximum per run.
- thread_ref and item_idxs must be valid integers from the lists above.
- Output valid JSON only, no markdown fences.`

  let parsed: { thread_updates?: any[]; new_threads?: any[] } = {}
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    if (match) parsed = safeJSON(match[0])
  } catch (err) {
    console.error('[stories] Claude call failed:', err)
    return
  }

  const now = new Date().toISOString()

  // Parallelize independent thread updates
  await Promise.all((parsed.thread_updates ?? []).map(async (upd) => {
    const thread = typeof upd.thread_ref === 'number' ? threads[upd.thread_ref] : null
    if (!thread) return
    const itemIds = (upd.item_idxs ?? []).map((i: number) => relevant[i]?.id).filter(Boolean)
    // Upsert: if this thread already has an event for this week, replace it with the latest analysis
    await db.execute({
      sql: `INSERT INTO story_events (id, thread_id, week, update_text, significance, feed_item_ids, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pipeline', ?)
            ON CONFLICT(thread_id, week, significance, source) DO UPDATE SET
              update_text    = excluded.update_text,
              feed_item_ids  = excluded.feed_item_ids,
              created_at     = excluded.created_at`,
      args: [crypto.randomUUID(), thread.id, week, upd.update_text ?? '', upd.significance ?? 'medium', JSON.stringify(itemIds), now],
    })
    await db.execute({
      sql: `UPDATE story_threads SET current_summary = ?, watch_for = ?, last_updated = ? WHERE id = ?`,
      args: [upd.new_summary ?? thread.current_summary, upd.new_watch_for ?? thread.watch_for, now, thread.id],
    })
  }))

  // Collect high-significance events for prediction evidence linking
  const highSigEvents: { threadTitle: string; category: string; eventText: string }[] = []
  for (const upd of parsed.thread_updates ?? []) {
    if (upd.significance === 'high') {
      const t = typeof upd.thread_ref === 'number' ? threads[upd.thread_ref] : null
      if (t) highSigEvents.push({ threadTitle: t.title, category: t.category, eventText: upd.update_text ?? '' })
    }
  }

  // New threads — enforce cap, tracking count in memory to avoid repeated COUNT queries
  const { rows: countRows } = await db.execute(
    `SELECT COUNT(*) as c FROM story_threads WHERE status = 'active'`
  )
  let activeCount = (countRows[0] as any).c as number

  for (const nt of parsed.new_threads ?? []) {
    if (!nt.title) continue
    if (activeCount >= MAX_ACTIVE) {
      await archiveOldest()
      activeCount--
    }
    const id = crypto.randomUUID()
    await db.execute({
      sql: `INSERT OR IGNORE INTO story_threads
              (id, title, category, status, current_summary, watch_for, is_pinned, first_seen, last_updated)
            VALUES (?, ?, ?, 'active', ?, ?, 0, ?, ?)`,
      args: [id, nt.title, nt.category ?? 'market', nt.current_summary ?? '', nt.watch_for ?? '', now, now],
    })
    const itemIds = (nt.item_idxs ?? []).map((i: number) => relevant[i]?.id).filter(Boolean)
    await db.execute({
      sql: `INSERT INTO story_events (id, thread_id, week, update_text, significance, feed_item_ids, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pipeline', ?)`,
      args: [crypto.randomUUID(), id, week, nt.update_text ?? '', nt.significance ?? 'medium', JSON.stringify(itemIds), now],
    })
    activeCount++
    if (nt.significance === 'high' && nt.title) {
      highSigEvents.push({ threadTitle: nt.title, category: nt.category ?? 'market', eventText: nt.update_text ?? '' })
    }
  }

  if (highSigEvents.length) {
    applyStoryEvidence(highSigEvents).catch(console.error)
  }

  await pruneOldThreads()
  console.log(`[stories] updated ${parsed.thread_updates?.length ?? 0} threads, created ${parsed.new_threads?.length ?? 0} new`)
}

// ── Thread relationship linking ────────────────────────────────────────────

const LINK_STOP = new Set([
  'with','that','this','from','have','been','will','more','over','into','about',
  'when','what','where','which','their','there','model','models','system','systems',
  'using','could','would','should','also','well','some','many','most','very','just',
  'like','make','made','work','works','working','used','uses','data','based','large',
  'small','high','both','other','these','those','only','first','last','such','even',
  'than','then','were','they','them','your','each','week','this','that','through',
  'after','before','across','between','towards','artificial','intelligence',
])

function threadKeywords(title: string, watchFor: string, eventText: string): Set<string> {
  const raw = `${title} ${watchFor} ${eventText}`
  const words = raw.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4 && !LINK_STOP.has(w))
  // Deduplicate, keep up to 12
  return new Set(words.slice(0, 12))
}

function jaccard(a: Set<string>, b: Set<string>): { score: number; shared: string[] } {
  const shared = [...a].filter(w => b.has(w))
  const union  = new Set([...a, ...b])
  return { score: union.size === 0 ? 0 : shared.length / union.size, shared }
}

export async function linkThreads(): Promise<void> {
  // Load active threads with their latest event text
  const { rows: threadRows } = await db.execute(`
    SELECT st.id, st.title, st.watch_for,
           se.update_text as latest_event
    FROM story_threads st
    LEFT JOIN story_events se ON se.thread_id = st.id
      AND se.created_at = (SELECT MAX(created_at) FROM story_events WHERE thread_id = st.id)
    WHERE st.status = 'active'
  `)
  const threads = threadRows as any[]
  if (threads.length < 2) return

  // Build keyword set per thread
  const kwSets = threads.map(t =>
    threadKeywords(t.title ?? '', t.watch_for ?? '', t.latest_event ?? '')
  )

  // Find candidate pairs above Jaccard threshold
  const THRESHOLD = 0.18
  const candidates: { i: number; j: number; shared: string[]; score: number }[] = []
  for (let i = 0; i < threads.length - 1; i++) {
    for (let j = i + 1; j < threads.length; j++) {
      const { score, shared } = jaccard(kwSets[i], kwSets[j])
      if (score >= THRESHOLD && shared.length >= 2) {
        candidates.push({ i, j, shared, score })
      }
    }
  }

  const now = new Date().toISOString()

  // Prune links not confirmed in the last 7 days before adding new ones
  const stale = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
  await db.execute({ sql: `DELETE FROM thread_relations WHERE last_confirmed_at < ?`, args: [stale] })

  if (candidates.length === 0) return

  // Batch-confirm candidates with Claude in a single call
  const prompt = candidates.map((c, n) =>
    `${n + 1}. "${threads[c.i].title}" + "${threads[c.j].title}" — shared: [${c.shared.join(', ')}]`
  ).join('\n')

  let confirmed: { n: number; related: boolean; label?: string }[] = []
  try {
    const resp = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 800,
      system: [{
        type: 'text',
        text: 'You evaluate whether pairs of AI news story threads are meaningfully related — not just superficially sharing AI terminology. A meaningful link means the stories share a specific dynamic, competing interests, or causal connection that would help a reader understand one better by knowing about the other.',
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role: 'user',
        content: `Evaluate each pair. Return ONLY a JSON array:\n[{"n":1,"related":true,"label":"one sentence on how they connect"},{"n":2,"related":false},...]\n\n${prompt}`,
      }],
    })
    const text  = resp.content[0].type === 'text' ? resp.content[0].text : '[]'
    const match = text.match(/\[[\s\S]*\]/)
    if (match) confirmed = safeJSON(match[0])
  } catch (err) {
    console.error('[stories] linkThreads Claude call failed:', err)
    // On error: upsert all candidates by keyword overlap alone, without labels
    confirmed = candidates.map((_, n) => ({ n: n + 1, related: true }))
  }

  // Upsert confirmed links
  let linked = 0
  for (const entry of confirmed) {
    if (!entry.related) continue
    const c = candidates[entry.n - 1]
    if (!c) continue
    const a  = threads[c.i].id as string
    const b  = threads[c.j].id as string
    // Canonical order: smaller string first, so (a,b) and (b,a) always map to the same row
    const [tA, tB] = a < b ? [a, b] : [b, a]
    await db.execute({
      sql: `INSERT INTO thread_relations
              (id, thread_a_id, thread_b_id, shared_tags, strength, label, updated_at, last_confirmed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(thread_a_id, thread_b_id) DO UPDATE SET
              shared_tags       = excluded.shared_tags,
              strength          = excluded.strength,
              label             = excluded.label,
              updated_at        = excluded.updated_at,
              last_confirmed_at = excluded.last_confirmed_at`,
      args: [crypto.randomUUID(), tA, tB, JSON.stringify(c.shared), c.score, entry.label ?? null, now, now],
    })
    linked++
  }

  console.log(`[stories] linkThreads: ${linked} links upserted, ${candidates.length - linked} rejected`)
}

export async function resolveStoryThread(id: string): Promise<void> {
  await db.execute({
    sql: `UPDATE story_threads SET status = 'resolved', resolved_at = ? WHERE id = ?`,
    args: [new Date().toISOString(), id],
  })
}

export async function deleteStoryThread(id: string): Promise<void> {
  await db.execute({ sql: `DELETE FROM story_events WHERE thread_id = ?`, args: [id] })
  await db.execute({ sql: `DELETE FROM story_threads WHERE id = ?`, args: [id] })
}
