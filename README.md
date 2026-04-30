# AI Daily Update

A personal AI tracking dashboard that aggregates news across the AI ecosystem, tracks model releases, surfaces trending research, and uses Claude to generate narrative story threads, weekly digests, and project ideas.

## Features

### Feeds & Discovery
- **Live Feed** — aggregates AI news from ArXiv, Hacker News, GitHub Trending, RSS blogs, and HuggingFace Papers with full-text search (FTS5), tag filtering, and velocity scoring
- **Trending Repos** — surfaces trending GitHub repositories with language and topic filters
- **Datasets** — notable HuggingFace datasets with modality and task category metadata
- **RSS Feeds** — `/feed.rss` and `/radar.rss` for subscribing to feed items and radar changes

### Intelligence Layer (Claude-powered)
- **Story Threads** — Claude tracks evolving narratives across feed items, building a timeline of developments per story with significance scoring and related-thread detection
- **Weekly Digest** — structured weekly briefing summarizing top developments, model releases, and radar changes
- **Tech Radar** — auto-classifies tools and frameworks into adopt / trial / assess / hold with rationale
- **Project Advisor** — suggests buildable project ideas based on what's trending in the feed
- **Entity Tracking** — named entity extraction across feed items with mention frequency and detail pages
- **Benchmark Snapshots** — tracks model performance metrics over time with history API

### Models & Predictions
- **Models** — AI model releases with benchmarks, costs, context windows, and capability comparisons
- **Predictions** — AI milestone forecasting with confidence levels, year ranges, and status lifecycle (upcoming → confirmed / failed)
- **Timeline** — interactive full-screen timeline of AI predictions from 2018 to 2055

## Stack

- Next.js 15 App Router + TypeScript
- Tailwind CSS (dark-mode only)
- SQLite via `@libsql/client` — local file in dev, Turso in production
- Anthropic Claude API for summarization, entity extraction, story threading, and analysis
- FTS5 virtual table for full-text search with LIKE fallback
- Deployed on Vercel (serverless); cron via `vercel.json`

## Getting Started

```bash
npm install
cp .env.example .env.local
# fill in your keys in .env.local
npm run dev
```

Open http://localhost:3000. On first boot the pipeline fetches all sources and populates the database.

## Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `TURSO_DATABASE_URL` | Turso database URL (production only) |
| `TURSO_AUTH_TOKEN` | Turso auth token (production only) |
| `CRON_SECRET` | Random string to protect the `/api/cron/*` endpoints |

In local dev without `TURSO_DATABASE_URL`, a SQLite file is created at `data/pulse.db`.

## Deployment

Connect your GitHub repo to Vercel, add the environment variables in the Vercel dashboard, and push to deploy. The `vercel.json` cron triggers `/api/cron/fetch` daily and `/api/cron/digest` weekly.

## Architecture

```
lib/
  pipeline.ts          — orchestrates all source fetches on boot and cron
  db.ts                — schema, migrations, FTS5 setup
  utils.ts             — shared helpers (getMondayISO, relTime, safeJSON)
  intelligence/
    stories.ts         — Claude story thread detection and event logging
    hooks.ts           — per-item hook line generation
    digest.ts          — weekly digest generation
    radar.ts           — tech radar classification
    advisor.ts         — project idea generation
    entities.ts        — named entity extraction
    benchmarks.ts      — benchmark snapshot ingestion
    models.ts          — model release enrichment
    predictions.ts     — prediction nudging and status updates

app/
  page.tsx             — home dashboard with card summaries
  feed/                — paginated feed with search, tags, sort
  stories/             — story thread list and detail timeline
  models/              — model comparison table
  predictions/         — prediction tracker
  timeline/            — full-screen prediction timeline
  radar/               — tech radar visualization
  entities/            — entity mention browser
  digest/              — weekly digest viewer
  repos/               — trending GitHub repos
```
