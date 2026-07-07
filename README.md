# AI Daily Update

**Live:** [ai-daily-update-ktnf.vercel.app](https://ai-daily-update-ktnf.vercel.app/)

A personal AI intelligence dashboard that aggregates 14+ sources, uses Claude to screen for relevance and extract signal, and surfaces what actually matters in the AI landscape — updated twice daily.

## What it does

- **Feed** — Articles from arXiv, Hacker News, GitHub, HuggingFace, YouTube, RSS feeds, and more. Claude screens each item for relevance and writes a one-sentence hook.
- **Daily Brief** — A 4-section (Signal / Rising / Watch / Shift) briefing generated each morning.
- **Stories** — Narrative threads connecting related articles over time, with weekly arc graphs.
- **Weekly Digest** — Longer-form briefing covering macro trends, research highlights, and a tools roundup.
- **Models** — Release tracker for major AI models with benchmarks, pricing, and context window data.
- **Repos** — Trending GitHub repositories in AI/ML ranked by star velocity.
- **Datasets** — HuggingFace and Kaggle datasets filtered by modality and task type.
- **Predictions** — AI milestone predictions with confidence levels and automatic evidence tracking.
- **Advisor** — Claude generates personalized project ideas based on trending developments.
- **Timeline** — Visual history of AI events and predictions from 2015 through projected 2030+.
- **Health** — Ops dashboard: per-source fetch/screening status, Claude token usage, cron failures, and eval quality flags, all in one page.

## Stack

- **Framework:** Next.js 16, React 19, TypeScript
- **Styling:** Tailwind CSS 4
- **Database:** SQLite (local dev) / Turso libsql (production)
- **AI:** Anthropic Claude — Sonnet 4.6 for analysis, Haiku 4.5 for screening and hooks
- **Alerts:** Resend (health-check failure emails)
- **Deploy:** Vercel

## Local setup

**Prerequisites:** Node.js 18+

```bash
git clone <repo-url>
cd ai-pulse
npm install
```

Create `.env.local` in the project root:

```env
ANTHROPIC_API_KEY=sk-ant-...
CRON_SECRET=any-random-string-you-choose

# Leave these out for local dev — SQLite at data/pulse.db is used automatically
# TURSO_DATABASE_URL=libsql://...
# TURSO_AUTH_TOKEN=...
```

Start the dev server:

```bash
npm run dev
```

App runs at `http://localhost:3000`. The database and schema are created automatically on first run at `data/pulse.db`.

### Seed the feed

The feed is empty until you trigger the pipeline. With the dev server running:

```bash
# Step 1: fetch all sources and insert raw items (~5-10s, no Claude calls)
curl -H "Authorization: Bearer any-random-string-you-choose" \
  http://localhost:3000/api/cron/fetch-ingest

# Step 2: screen items with Claude and run intelligence tasks (~2-5 min)
curl -H "Authorization: Bearer any-random-string-you-choose" \
  http://localhost:3000/api/cron/fetch-intel
```

On Windows PowerShell:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/cron/fetch-ingest" `
  -Headers @{ Authorization = "Bearer any-random-string-you-choose" }

Invoke-RestMethod -Uri "http://localhost:3000/api/cron/fetch-intel" `
  -Headers @{ Authorization = "Bearer any-random-string-you-choose" }
```

## Deploying to Vercel

1. Push the repo to GitHub
2. Import the project at [vercel.com](https://vercel.com)
3. Set environment variables in the Vercel dashboard:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `CRON_SECRET` | Any secret string — Vercel uses this automatically when triggering cron routes |
| `TURSO_DATABASE_URL` | Your Turso database URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Your Turso auth token |

4. Deploy. Cron jobs run automatically per `vercel.json`.

### Cron schedule (UTC)

| Job | Schedule | What it does |
|---|---|---|
| `/api/cron/fetch-ingest` | 8:00am, 8:00pm | Fetches all sources, inserts raw items |
| `/api/cron/fetch-intel` | 8:20am, 8:20pm | Claude screening + hooks + story threads + entity extraction |
| `/api/cron/fetch-intel-2` | 8:29am, 8:29pm | DB-only: thread linking, prediction/entity backfill, radar, pruning, acceleration scores |
| `/api/cron/brief` | 8:45am | Generates the daily brief if not yet done today |
| `/api/cron/digest` | 9:00am | Generates the weekly digest if not yet done this week |
| `/api/cron/predictions` | 10:00am Mon | Refreshes AI milestone prediction confidence/evidence |
| `/api/cron/benchmarks` | 9:00am on the 1st/11th/21st | Syncs model benchmark scores |
| `/api/cron/health-notify` | 9:30am | Runs health checks, emails failures via Resend |

The fetch pipeline is split into three cron jobs so each stays within Vercel's 300s function timeout. Ingest does HTTP fetches and DB writes only. Intel (phase 1) does the Claude-heavy work — screening, hooks, story threads, entity extraction. Intel-2 (phase 2) is DB-only follow-up work with no in-memory dependency on phase 1's output, so it runs as a separate invocation on its own schedule.

## Dev commands

```bash
npm run dev         # dev server at http://localhost:3000
npm run build       # production build
npm start           # start production build
npx tsc --noEmit    # type-check without building
```

No test suite.

## Project structure

```
app/
├── api/
│   ├── cron/          # fetch-ingest, fetch-intel, brief, digest, predictions, benchmarks, health-notify
│   └── ...            # feed, stories, digest, advisor, health, etc.
├── feed/
├── stories/
├── digest/
├── health/
└── ...                # models, repos, datasets, predictions, advisor, timeline

lib/
├── pipeline.ts        # fetchIngest() and fetchIntelligence()
├── db.ts              # libsql client + schema init + migrations
├── claude.ts          # Anthropic client + model constants
├── sources/           # one fetcher per source
├── intelligence/      # Claude-powered enrichment (hooks, stories, digest, ...)
├── eval/              # LLM-judge groundedness/pairwise scoring for digest & brief
└── health*.ts, screening-stats.ts, notify.ts, cronRuns.ts   # ops/health-dashboard data

components/
└── icons.tsx          # shared nav + in-page glyphs

scripts/
└── eval/              # capture golden sets, replay evals, export flagged cases for review
```

## Sources

`arxiv` · `hackernews` · `rss` · `github` (trending) · `github_top` · `huggingface` · `hf_models` · `datasets` · `kaggle` · `youtube` · `paperswithcode` · `semanticscholar` · `github_releases`

## Notes

- Local dev uses `data/pulse.db` — no Turso account needed
- Schema migrations are append-only `ALTER TABLE` blocks in `lib/db.ts` — never drop and recreate tables
- Items inserted by `fetch-ingest` are hidden from the feed (`screened = 0`) until `fetch-intel` processes them
- Every real digest/brief generation is scored for groundedness by an LLM judge (`lib/eval/`) — low-scoring cases are flagged, reviewed locally, and turned into golden-set regression fixtures via `scripts/eval/export-flagged.mts`
- `/health` surfaces the live state of all of the above — source status, screening quality, Claude spend, cron failures, and open eval flags
