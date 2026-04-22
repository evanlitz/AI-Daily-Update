import { createClient } from '@libsql/client'
import path from 'path'
import fs from 'fs'

const tursoUrl = process.env.TURSO_DATABASE_URL

let url: string
if (tursoUrl) {
  url = tursoUrl
} else {
  // Local dev only — Vercel's filesystem is read-only
  try {
    const dataDir = path.join(process.cwd(), 'data')
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir)
    url = `file:${path.join(dataDir, 'pulse.db')}`
  } catch {
    throw new Error(
      'TURSO_DATABASE_URL is not set and local filesystem is read-only. ' +
      'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your Vercel environment variables.'
    )
  }
}

export const db = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

// Helper: run multiple statements at startup
async function exec(sql: string) {
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean)
  for (const s of statements) {
    await db.execute(s)
  }
}

// Initialize schema
await exec(`
CREATE TABLE IF NOT EXISTS feed_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  summary TEXT,
  raw_content TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  topic_tags TEXT DEFAULT '[]',
  velocity_score REAL DEFAULT 0,
  is_read INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS weekly_digest (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  content_md TEXT,
  highlights TEXT DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tech_radar (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  quadrant TEXT NOT NULL,
  rationale TEXT,
  last_updated TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_ideas (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  difficulty INTEGER,
  skills_learned TEXT DEFAULT '[]',
  estimated_hours INTEGER,
  starter_checklist TEXT DEFAULT '[]',
  tech_stack TEXT DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS github_repos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  description TEXT,
  language TEXT,
  stars_total INTEGER DEFAULT 0,
  stars_today INTEGER DEFAULT 0,
  topics TEXT DEFAULT '[]',
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  description TEXT,
  task_categories TEXT DEFAULT '[]',
  modalities TEXT DEFAULT '[]',
  size_category TEXT,
  license TEXT,
  downloads INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  last_modified TEXT,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_predictions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  year_min INTEGER NOT NULL,
  year_max INTEGER NOT NULL,
  year_guess INTEGER NOT NULL,
  month_guess INTEGER DEFAULT 6,
  date_guess TEXT,
  confidence TEXT NOT NULL,
  description TEXT,
  rationale TEXT,
  evidence TEXT DEFAULT '[]',
  status TEXT DEFAULT 'upcoming',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  lab TEXT NOT NULL,
  family TEXT NOT NULL,
  release_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  context_window INTEGER,
  input_cost_per_mtok REAL,
  output_cost_per_mtok REAL,
  knowledge_cutoff TEXT,
  modalities TEXT DEFAULT '[]',
  benchmarks TEXT DEFAULT '{}',
  highlights TEXT DEFAULT '[]',
  notes TEXT,
  feed_item_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
`)

export default db
