// For Vercel deployment, replace better-sqlite3 with @libsql/client (Turso).
// Run `turso db create ai-pulse` and `turso db tokens create ai-pulse`,
// then set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN env vars.
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const dataDir = path.join(process.cwd(), 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir)

const db = new Database(path.join(dataDir, 'pulse.db'))

db.exec(`
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
  name TEXT NOT NULL,
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
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  year_min INTEGER NOT NULL,
  year_max INTEGER NOT NULL,
  year_guess INTEGER NOT NULL,
  confidence TEXT NOT NULL,
  description TEXT,
  rationale TEXT,
  evidence TEXT DEFAULT '[]',
  status TEXT DEFAULT 'upcoming',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`)

db.exec(`
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
);
`)

db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS tech_radar_name_idx ON tech_radar(name)`)
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ai_predictions_title_idx ON ai_predictions(title)`)
// ai_models slug is UNIQUE in the column definition — no separate index needed
// Safe migrations — ignored if columns already exist
try { db.exec(`ALTER TABLE ai_predictions ADD COLUMN date_guess TEXT`) } catch {}
try { db.exec(`ALTER TABLE ai_predictions ADD COLUMN month_guess INTEGER DEFAULT 6`) } catch {}
try { db.exec(`ALTER TABLE project_ideas ADD COLUMN tech_stack TEXT DEFAULT '[]'`) } catch {}

export default db
