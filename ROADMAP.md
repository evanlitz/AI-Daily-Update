# AI Pulse — Improvement Roadmap

## Phase 1 — Bugs & Polish (1–3 days)

| Item | File | Notes |
|---|---|---|
| Fix Load More + tag filter | `components/TrendFeed.tsx` | Pass `activeTag` to `/api/feed?tag=X` in `loadMore()`, then apply filter server-side |
| localStorage for sort + tag | `components/TrendFeed.tsx` | Persist `activeSort` and `activeTag` so they survive page refresh |
| Manual feed refresh button | `app/page.tsx` + new API route | POST to `/api/cron/fetch` on click, show a spinner |
| Sidebar mobile collapse | `app/layout.tsx` | At narrow viewport collapse to icons-only or hamburger; `marginLeft: 72` squishes content on small screens |

---

## Phase 2 — Core Features (1–2 weeks)

**Feed search**
Add a text input to `TrendFeed.tsx` that filters by `title` + `summary`. Either client-side over the loaded items or a `/api/feed?q=` param for full DB search. The feed has no discovery mechanism right now — you can only browse chronologically or sort by velocity.

**On-demand Digest**
The `/digest` page shows the last generated digest but there's no way to trigger a fresh one without waiting for the weekly cron. Add a "Generate now" button that calls `/api/digest/generate`. Takes 10–15 seconds; show a loading state.

**Model comparison**
On the `/models` page, add a checkbox to each row in `MetricChart`, then a "Compare" panel that shows a small table of all 4 metrics side-by-side for the selected models (max 3). Biggest missing feature for a model-tracking app.

**Predictions page**
`lib/intelligence/predictions.ts` and `/api/predictions` exist but there's no page for them. The `AIPrediction` type in `lib/types.ts` has year range, confidence, status — rich enough for a compelling timeline overlay or standalone page. Wire it up to a `/predictions` route.

**Radar: last-scanned timestamp**
Store `scanned_at` in DB metadata. Show "Last scanned: 3 days ago" next to the Scan Feed button.

---

## Phase 3 — Intelligence Layer (2–6 weeks)

**Auto benchmark updates**
Add a scheduled job that hits the SWE-bench API (or scrapes `swebench.com`) and updates `benchmarks.swe_bench` for known models. Same for HumanEval and ARC-AGI leaderboards. Right now every correction is manual.

**Feed velocity sparklines**
Each `FeedItem` already has `velocity_score`. Show a tiny sparkline or colored heat-dot (green/yellow/red) on each card. Users currently have no visual signal of what's trending without switching the sort.

**Radar ring history**
Track when items move between rings (ASSESS → TRIAL → ADOPT). Store a `ring_history` JSON column. Show a movement timeline in the signal detail panel.

**Advisor personalization**
Add a short "skills + interests" prompt before generation (stored in `localStorage`). Pass level, interest, and hours-available as context to the Claude call in `lib/intelligence/advisor.ts`.

**Digest quality**
(1) Add a "hot takes" section — Claude extracts controversial/surprising claims from the week's feed. (2) Link each bullet to the original feed item. (3) Add a "worth building" section tying back to the Advisor.

---

## Phase 4 — Platform (2–3 months)

**PWA / installable**
Add `manifest.json` + service worker. Makes AI Pulse a first-class app you open from your dock, not a tab you have to remember.

**Email digest**
Send the weekly digest to an email address (Resend or Nodemailer). Store recipient in `.env`. Trigger from the existing digest cron.

**Custom source management**
Settings UI to add/remove RSS feeds and GitHub repos instead of hardcoding them in `lib/sources/`. Store in DB.

**Historical benchmark chart**
Store a `benchmark_snapshots` table with `(model_slug, date, metric, value)`. Add a line chart mode to the Models page showing how scores have moved over time.

**RSS/webhook output**
Expose `/api/feed.rss` and `/api/radar.rss` so others can subscribe to your radar updates in any feed reader.

---

## Priority order

1. Fix tag + Load More bug — wrong behavior, not just polish
2. Feed search — most common "I know what I want to find" use case
3. Predictions page — free feature, data and API already exist
4. Model comparison — makes the models page 10x more useful
5. On-demand digest
6. PWA
7. Auto benchmark updates
