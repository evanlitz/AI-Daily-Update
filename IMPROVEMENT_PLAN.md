# AI Pulse — Improvement Plan

## Phase 1: Foundation fixes
*Fast, high trust-building value. Fix these first so everything built on top is solid.*

- [x] **1. Fix Vercel cron to 6-hour schedule** — Reverted; user is on Hobby plan (1 daily cron kept).
- [x] **2. Fix story thread multi-event-per-week** — `UNIQUE(thread_id, week)` → `UNIQUE(thread_id, week, significance)`. HIGH events no longer overwritten by later LOW events in the same week.
- [x] **3. Pipeline health panel on home** — Status strip on home page: colored freshness dot, last fetch time, items in last 6h.

---

## Phase 2: Close the loop
*You've built prediction evidence linking and entity extraction — these need front-end surfaces to actually matter.*

- [x] **4. Auto-generate weekly digest on Monday** — Second Vercel cron (`/api/cron/digest`, Mondays 9 AM UTC) with idempotency guard. `maxDuration = 60` on both cron routes.
- [x] **5. Prediction evidence surfacing** — "Prediction Signals This Week" section on home page shows up to 3 predictions with evidence added in the last 7 days.

---

## Phase 3: Search
*Single session, high daily-use value.*

- [x] **6. Feed search (FTS5)** — FTS5 virtual table + 4 sync triggers + backfill on first run. API routes through FTS5 with LIKE fallback. Client filter now includes hook field.

---

## Phase 4: Entity graph as navigation
*Makes the Phase 5 entity work actually useful.*

- [x] **7. Entity-filtered navigation** — Entity chips on story detail and related stories on entity detail create a navigable graph. `/entities/[id]` is the filtered "lens" view.
- [x] **8. Entity sidebar on story threads** — "Key Entities" section in story detail shows top 5 entities (by feed item overlap) with type-colored chips linking to `/entities/[id]`. Entity detail shows "Related Stories" linking back to `/stories`.

---

## Phase 5: Intelligence quality
*Higher complexity, diminishing returns. Do last.*

- [ ] **9. Velocity deduplication** — Cluster feed items by semantic overlap before scoring so the same story from 5 sources doesn't inflate velocity. The digest clustering logic already does this — reuse it.
- [ ] **10. Semantic story thread matching** — Feed the `watch_for` hint back into matching logic; use entity overlap as a primary signal instead of just title keywords.

---

## Summary

| # | Task | Effort | Unlocks |
|---|------|--------|---------|
| 1 | Vercel cron 6-hour | Trivial | Fresh data in prod |
| 2 | Multi-event story weeks | Small | Data integrity |
| 3 | Pipeline health panel | Small | Visibility |
| 4 | Auto-digest on Monday | Small | Autonomous output |
| 5 | Prediction evidence surfacing | Medium | Phase 3 payoff |
| 6 | Feed search (FTS5) | Medium | Daily usability |
| 7 | Entity-filtered navigation | Medium | Phase 5 payoff |
| 8 | Entity sidebar on threads | Small | Richer story detail |
| 9 | Velocity deduplication | Medium | Signal quality |
| 10 | Semantic thread matching | Large | Intelligence quality |
