# AI Daily Update — Intelligence Over Time Plan

Goal: make the app accumulate understanding across time, not just data.
Today the stories section has memory. Everything else is a stateless snapshot.
This plan closes that gap in five phases.

---

## Phase 1 — Digest-to-digest delta
**Effort: ~2 hours | Risk: low | Files: `lib/intelligence/digest.ts`**

### What changes
When generating a weekly digest, pull the previous week's `highlights` and
`content_md` from `weekly_digest` and pass them to Claude alongside the current
week's feed items. The prompt becomes: *"Here's what you said last week. Here's
what happened this week. Note what changed, what resolved, what escalated."*

### DB changes
None. `weekly_digest` already stores `highlights` (JSON) and `content_md`.

### Prompt addition
```
PREVIOUS WEEK (week of {prev_week_start}):
{prev_highlights joined as bullets}

Write this week's digest against that context. Lead with what changed.
```

### UI changes
Add a "vs last week" diff section at the top of `/digest` showing items
that escalated, resolved, or are new since the prior digest.

### Edge case
If no previous digest exists (first run), fall back to current behavior.

---

## Phase 2 — Cross-thread relationships
**Effort: ~4 hours | Risk: medium | Files: `lib/intelligence/stories.ts`, new table**

### What changes
After story events are saved each cycle, run `linkThreads()` to find threads
that share significant entities. Store links in a new table. Surface "Related
threads" on the story detail view.

### DB changes
```sql
CREATE TABLE IF NOT EXISTS thread_relations (
  id                 TEXT PRIMARY KEY,
  thread_a_id        TEXT NOT NULL REFERENCES story_threads(id) ON DELETE CASCADE,
  thread_b_id        TEXT NOT NULL REFERENCES story_threads(id) ON DELETE CASCADE,
  shared_tags        TEXT NOT NULL,  -- JSON array of shared keywords/entities
  strength           REAL NOT NULL DEFAULT 0.0,
  updated_at         TEXT NOT NULL,
  last_confirmed_at  TEXT NOT NULL,  -- last time overlap was re-verified
  UNIQUE(thread_a_id, thread_b_id)
);
```

`last_confirmed_at` is separate from `updated_at`. Each fetch cycle re-checks
existing links — if a thread's keywords drift apart (story resolves, topic
shifts) and the overlap drops below threshold, the link is deleted. This
prevents stale connections persisting indefinitely.

### Linking strategy
Do NOT send all N*(N-1)/2 thread pairs to Claude — at 50 threads that's 1225
comparisons. Instead:

1. Build a keyword index from each thread's `title + watch_for + latest event`
2. Strip stop words, extract 4–6 content words per thread (reuse the stop-word
   list already in `app/api/stories/[id]/route.ts`)
3. Compare all pairs by keyword overlap (Jaccard similarity)
4. For pairs with Jaccard ≥ 0.2 (≥ 2 shared meaningful words), call Claude to
   confirm the link and label the relationship in one sentence
5. Store strength as the Jaccard score; update `last_confirmed_at` on each pass
6. Delete links where `last_confirmed_at` is older than 2 fetch cycles

This keeps Claude calls to a handful per cycle instead of hundreds.

### One-time backfill
On first deploy, run `linkThreads()` over all existing active threads so
relationships are seeded immediately rather than waiting for new events.
Add a migration guard flag in `db.ts` so it only runs once.

### API route
`GET /api/stories/[id]/related` — returns threads linked to the given ID,
ordered by `strength DESC`.

### UI changes
Small "Related" section at the bottom of `StoryDetailView` listing thread
titles with category chips and strength indicators.

### Risk
Keyword matching produces false positives on generic terms ("model", "AI").
Mitigation: reuse the existing stop-word list from `[id]/route.ts`. The Claude
confirmation step acts as a second filter — it only fires on pairs that already
passed the Jaccard threshold.

---

## Phase 3 — Evidence-driven predictions
**Effort: ~3 hours | Risk: low-medium | Files: `lib/intelligence/stories.ts`, `lib/intelligence/predictions.ts`**

### What changes
When a high-significance story event is saved, check the `ai_predictions` table
for predictions in the same category whose `confidence` is not already
`confirmed`. If a keyword match passes, auto-append the story as an evidence
link and optionally nudge confidence up one step.

### Confidence nudge rules
- Only nudge if significance is `high`
- Never auto-set to `confirmed` — that requires manual review
- Max one nudge per prediction per week (prevents runaway escalation)
- Log every nudge to console so it is visible and auditable

### Category alignment
Story categories (capability/safety/policy/market/tooling/research) map
directly to prediction categories. Use category as the primary filter, then
keyword overlap against `predictions.title` as secondary.

### DB changes
`ai_predictions.evidence` is already a JSON array of `{title, url, source}`
objects. Append to it. No schema change needed.

### One-time backfill
After first deploy, run a one-shot pass that checks all existing high-significance
story events against all open predictions. This seeds evidence links from
existing data rather than starting from zero.

### Note: Phase 2 not required
This phase uses category + keyword matching only, not the entity graph.
It can be built before, after, or in parallel with Phase 2.

---

## Phase 4 — User affinity weighting
**Effort: ~4 hours | Risk: low-medium | Files: `components/TrendFeed.tsx`, `app/stories/page.tsx`, new table + API route**

### What changes
The app already writes `is_read` on feed item opens. Extend this: track which
categories and sources the user actually engages with. Use those counts to
softly reorder what gets surfaced on the home page and in digest highlights.

### Why category-only affinity is too coarse
A table keyed only on `category` conflates everything. A user who reads all
capability stories but only the Anthropic ones will still see all capability
stories ranked up — including the ones they consistently skip. Tracking
`(category, source)` pairs gives the granularity needed to be actually useful.
Holding off on full per-entity affinity until Phase 5 entities exist.

### DB changes
```sql
CREATE TABLE IF NOT EXISTS user_affinity (
  category    TEXT NOT NULL,
  source      TEXT NOT NULL,  -- feed source key or 'story' for thread opens
  read_count  INTEGER NOT NULL DEFAULT 0,
  open_count  INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (category, source)
);
```

### Event tracking
- Feed item opened → increment `read_count` for `(topic_tag[0], item.source)`
- Story thread opened → increment `open_count` for `(thread.category, 'story')`
- Fire-and-forget POST to `/api/affinity` — non-blocking, failure is acceptable

### Affinity usage
- `getHomeData()` in `app/page.tsx`: join `user_affinity` on category when
  ordering story threads (sum `open_count DESC`)
- Digest generation: pass top 3 `(category, source)` pairs by `read_count` as
  context so Claude prioritises them in highlights

### Important constraint
Affinity weights content ordering but never hides categories entirely.
The feed still shows everything — affinity only affects *rank*, not *visibility*.
Without this constraint the app becomes a filter bubble that stops surfacing
things the user doesn't already know they care about.

---

## Phase 5 — Entity graph
**Effort: ~2 days | Risk: high | Files: new tables, `lib/intelligence/hooks.ts`, multiple pages**

### What changes
Extract named entities (companies, models, researchers) during the relevance
screening step. Index them against feed items, story threads, radar items, and
predictions. Enable cross-section queries: "everything about Anthropic."

### DB changes
```sql
CREATE TABLE IF NOT EXISTS entities (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,  -- canonical normalised form
  type          TEXT NOT NULL,         -- 'company' | 'model' | 'researcher' | 'paper'
  aliases       TEXT NOT NULL DEFAULT '[]',  -- JSON array of known alternate spellings
  first_seen    TEXT NOT NULL,
  mention_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS entity_mentions (
  entity_id    TEXT NOT NULL REFERENCES entities(id),
  source_type  TEXT NOT NULL,  -- 'feed_item' | 'story_thread' | 'radar' | 'prediction'
  source_id    TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (entity_id, source_type, source_id)
);
```

### Extraction point
Add an `entities` array to the `screenAndHook` response in `hooks.ts`:
```json
{"n": 1, "relevant": true, "hook": "...", "entities": ["Anthropic", "Claude 4"]}
```
This adds ~10 tokens per item to an existing Claude call — nearly free.

### Entity resolution — realistic risk
"GPT-4o", "GPT 4o", "gpt4o" are the same entity. With LLM extraction,
expect 20–30% raw duplicates before normalization, not 5%. Mitigation needs
to be robust:

1. **At extraction**: ask Claude to return entities in a canonical form
   (`"GPT-4o"` not `"gpt 4 o"`) by including a few-shot example in the prompt
2. **At insertion**: normalize to lowercase-stripped form, fuzzy-match against
   existing `entities.name` before inserting (Levenshtein distance ≤ 2 = same)
3. **Aliases column**: store every raw variant seen as an alias so future
   mentions of `"gpt4o"` resolve to the canonical `"GPT-4o"` record
4. **Manual review**: add an admin view listing entities with `mention_count < 3`
   that look similar (edit distance ≤ 2) for periodic cleanup

Accept that the first 2–3 weeks of data will have noise. The alias system
means it can be corrected retroactively by merging records.

### One-time backfill
After first deploy, run entity extraction over the most recent 200 feed items
already in the DB using a batch Claude call. This seeds the entity table before
the next live fetch cycle.

### New page: `/entities/[id]`
A unified timeline of everything the app has seen about that entity:
feed items, story thread events, radar movements, prediction evidence.
The closest thing to "what does the app know about X" in one view.

### Risk: scope creep
This phase can grow indefinitely. Time-box it strictly:
- Week 1: extraction + DB insertion + deduplication logic only
- Week 2: `/entities/[id]` page
- Week 3+: validate extraction quality over real data before building anything else

Do not build a graph visualisation or cross-section search until extraction
quality is confirmed over at least 4 weeks of live data.

---

## Recommended build order

| Step | Phase | Parallelisable with | Why this order |
|---|---|---|---|
| 1 | Digest delta (P1) | — | Highest payoff, lowest risk, 2 hours |
| 2 | Thread relations (P2) | Step 3 | Core connective tissue for stories |
| 2 | Affinity (P4) | Step 2 | Touches different files, no shared deps |
| 4 | Prediction evidence (P3) | — | Short add-on; benefits from P2 patterns |
| 5 | Entity graph (P5) | — | Depends on lessons learned from 1–4 |

Steps 2 and 3 (Phase 2 and Phase 4) can be built in parallel — they touch
entirely different files and tables with no cross-dependencies.

---

## What this doesn't solve

- **Model timeline awareness**: when a new model drops, the app doesn't
  automatically link it to related story threads. This becomes a Phase 5
  side effect once entity extraction is live — models are entities.
- **Anomaly detection**: noticing "3× normal volume about safety this week"
  requires a rolling baseline. Out of scope until there is 4–6 weeks of
  clean data to establish one.
- **Cross-section search**: searching across feed + stories + radar + predictions
  simultaneously requires the entity graph (Phase 5) to be the index.

---

## Cost estimate (Claude API)

| Phase | New calls per fetch cycle | Estimated cost |
|---|---|---|
| 1 | 0 (same digest call, slightly larger prompt) | +~$0.001 |
| 2 | 0–3 (only for pairs passing Jaccard threshold) | +~$0.005 |
| 3 | 0 (runs inside existing story event logic) | +~$0.000 |
| 4 | 0 (client-side tracking only) | +~$0.000 |
| 5 | +~10 tokens per item in existing screen call | +~$0.002 |

Total added cost per 6-hour fetch cycle: **< $0.01**
