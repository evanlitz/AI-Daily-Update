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
  is_read INTEGER DEFAULT 0,
  hook TEXT
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
);

CREATE TABLE IF NOT EXISTS story_threads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_summary TEXT,
  watch_for TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL,
  last_updated TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS story_events (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  week TEXT NOT NULL,
  update_text TEXT NOT NULL,
  significance TEXT NOT NULL DEFAULT 'medium',
  feed_item_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
)
`)

// Migrations for existing databases
try { await db.execute(`ALTER TABLE feed_items ADD COLUMN hook TEXT`) } catch {}
try { await db.execute(`ALTER TABLE tech_radar ADD COLUMN ring_history TEXT DEFAULT '[]'`) } catch {}
// Deduplicate story_events before adding unique constraint — keep latest per (thread_id, week)
try {
  // Widen uniqueness from (thread_id, week) → (thread_id, week, significance)
  // so a high-sig event is never overwritten by a low-sig one in the same week
  await db.execute(`DROP INDEX IF EXISTS idx_story_events_thread_week`)
  await db.execute(`
    DELETE FROM story_events WHERE rowid NOT IN (
      SELECT MAX(rowid) FROM story_events GROUP BY thread_id, week, significance
    )
  `)
  await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_story_events_thread_week_sig ON story_events (thread_id, week, significance)`)
} catch {}
try { await db.execute(`
  CREATE TABLE IF NOT EXISTS benchmark_snapshots (
    id         TEXT PRIMARY KEY,
    model_slug TEXT NOT NULL,
    metric     TEXT NOT NULL,
    value      REAL NOT NULL,
    source     TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  )
`) } catch {}
try { await db.execute(`ALTER TABLE weekly_digest ADD COLUMN changes TEXT DEFAULT '[]'`) } catch {}
try { await db.execute(`ALTER TABLE ai_predictions ADD COLUMN last_nudged_at TEXT`) } catch {}
try { await db.execute(`
  CREATE TABLE IF NOT EXISTS entities (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    type          TEXT NOT NULL,
    aliases       TEXT NOT NULL DEFAULT '[]',
    first_seen    TEXT NOT NULL,
    mention_count INTEGER NOT NULL DEFAULT 0
  )
`) } catch {}
try { await db.execute(`
  CREATE TABLE IF NOT EXISTS entity_mentions (
    entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_id   TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    PRIMARY KEY (entity_id, source_type, source_id)
  )
`) } catch {}
try { await db.execute(`
  CREATE TABLE IF NOT EXISTS user_affinity (
    category   TEXT NOT NULL,
    source     TEXT NOT NULL,
    read_count INTEGER NOT NULL DEFAULT 0,
    open_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (category, source)
  )
`) } catch {}
try { await db.execute(`
  CREATE TABLE IF NOT EXISTS thread_relations (
    id                TEXT PRIMARY KEY,
    thread_a_id       TEXT NOT NULL REFERENCES story_threads(id) ON DELETE CASCADE,
    thread_b_id       TEXT NOT NULL REFERENCES story_threads(id) ON DELETE CASCADE,
    shared_tags       TEXT NOT NULL DEFAULT '[]',
    strength          REAL NOT NULL DEFAULT 0.0,
    label             TEXT,
    updated_at        TEXT NOT NULL,
    last_confirmed_at TEXT NOT NULL,
    UNIQUE(thread_a_id, thread_b_id)
  )
`) } catch {}

try { await db.execute(`ALTER TABLE story_events ADD COLUMN source TEXT NOT NULL DEFAULT 'pipeline'`) } catch {}
try { await db.execute(`ALTER TABLE story_events ADD COLUMN source_url TEXT`) } catch {}
try {
  await db.execute(`DROP INDEX IF EXISTS idx_story_events_thread_week_sig`)
  await db.execute(`
    DELETE FROM story_events WHERE rowid NOT IN (
      SELECT MAX(rowid) FROM story_events GROUP BY thread_id, week, significance, source
    )
  `)
  await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_story_events_thread_week_sig_src ON story_events (thread_id, week, significance, source)`)
} catch {}

// FTS5 full-text search — clean drop+rebuild every startup to prevent corrupt vtab state.
// Triggers use UPDATE OF so velocity_score updates never touch the vtab.
try {
  await db.execute(`DROP TRIGGER IF EXISTS fts_feed_ai`)
  await db.execute(`DROP TRIGGER IF EXISTS fts_feed_ad`)
  await db.execute(`DROP TRIGGER IF EXISTS fts_feed_au_del`)
  await db.execute(`DROP TRIGGER IF EXISTS fts_feed_au_ins`)
  await db.execute(`DROP TABLE IF EXISTS feed_items_fts`)
  await db.execute(`
    CREATE VIRTUAL TABLE feed_items_fts USING fts5(
      title, hook, raw_content,
      content='feed_items', content_rowid='rowid'
    )
  `)
  await db.execute(`
    CREATE TRIGGER fts_feed_ai AFTER INSERT ON feed_items BEGIN
      INSERT INTO feed_items_fts(rowid, title, hook, raw_content)
      VALUES (new.rowid, COALESCE(new.title,''), COALESCE(new.hook,''), COALESCE(new.raw_content,''));
    END
  `)
  await db.execute(`
    CREATE TRIGGER fts_feed_ad AFTER DELETE ON feed_items BEGIN
      INSERT INTO feed_items_fts(feed_items_fts, rowid, title, hook, raw_content)
      VALUES ('delete', old.rowid, COALESCE(old.title,''), COALESCE(old.hook,''), COALESCE(old.raw_content,''));
    END
  `)
  await db.execute(`
    CREATE TRIGGER fts_feed_au_del BEFORE UPDATE OF title, hook, raw_content ON feed_items BEGIN
      INSERT INTO feed_items_fts(feed_items_fts, rowid, title, hook, raw_content)
      VALUES ('delete', old.rowid, COALESCE(old.title,''), COALESCE(old.hook,''), COALESCE(old.raw_content,''));
    END
  `)
  await db.execute(`
    CREATE TRIGGER fts_feed_au_ins AFTER UPDATE OF title, hook, raw_content ON feed_items BEGIN
      INSERT INTO feed_items_fts(rowid, title, hook, raw_content)
      VALUES (new.rowid, COALESCE(new.title,''), COALESCE(new.hook,''), COALESCE(new.raw_content,''));
    END
  `)
  await db.execute(`INSERT INTO feed_items_fts(feed_items_fts) VALUES ('rebuild')`)
} catch (err) {
  console.warn('[db] FTS5 setup skipped (search falls back to LIKE):', err)
}

export default db
