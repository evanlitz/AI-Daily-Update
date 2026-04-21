# AI Pulse

A personal AI tracking dashboard that aggregates news from across the AI ecosystem, tracks model releases, visualizes predictions about the future of AI, and uses Claude to generate weekly digests and project ideas.

## Features

- **Live Feed** — aggregates AI news from ArXiv, Hacker News, GitHub Trending, RSS blogs, and HuggingFace Papers
- **Weekly Digest** — Claude summarizes the week's top developments into a structured briefing
- **Models** — tracks AI model releases with benchmarks, costs, and capability comparisons
- **Timeline** — interactive full-screen timeline of AI predictions from 2018 to 2055
- **Tech Radar** — auto-classifies tools and frameworks into adopt / trial / assess / hold
- **Project Advisor** — Claude suggests buildable project ideas based on what's trending
- **Datasets & Repos** — surfaces notable HuggingFace datasets and trending GitHub repos

## Stack

- Next.js 14 App Router + TypeScript
- Tailwind CSS (dark-mode)
- SQLite via `better-sqlite3` (local) / Turso (production)
- Anthropic Claude API for summarization and analysis
- Deployed on Vercel

## Getting Started

```bash
npm install
cp .env.example .env.local
# fill in your keys in .env.local
npm run dev
```

Open http://localhost:3000.

## Environment Variables

See `.env.example` for all required variables.

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `TURSO_DATABASE_URL` | Turso database URL (production only) |
| `TURSO_AUTH_TOKEN` | Turso auth token (production only) |
| `CRON_SECRET` | Random string to protect the cron endpoint |

## Deployment

Deploys to Vercel. Connect your GitHub repo, add the environment variables in the Vercel dashboard, and push to deploy.

For the production database, create a free Turso database and swap `lib/db.ts` to use `@libsql/client`.
