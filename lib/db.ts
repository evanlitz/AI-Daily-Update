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

// SQLite (and Turso's underlying engine) can reject a write with SQLITE_BUSY when
// another write is already in flight against the same database — e.g. two cron
// invocations overlapping. This is transient, not a logic error, so retry with
// backoff instead of failing the whole request. Patches the client in place so
// every db.execute()/db.batch() call across the app gets this for free.
function isBusyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /SQLITE_BUSY|database is locked/i.test(msg)
}

async function withBusyRetry<T>(fn: () => Promise<T>): Promise<T> {
  const ATTEMPTS = 5
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      return await fn()
    } catch (err) {
      if (!isBusyError(err) || i === ATTEMPTS - 1) throw err
      await new Promise(r => setTimeout(r, 200 * (i + 1)))
    }
  }
  throw new Error('unreachable')
}

const rawExecute = db.execute.bind(db)
const rawBatch = db.batch.bind(db)
db.execute = ((...args: Parameters<typeof rawExecute>) => withBusyRetry(() => rawExecute(...args))) as typeof db.execute
db.batch = ((...args: Parameters<typeof rawBatch>) => withBusyRetry(() => rawBatch(...args))) as typeof db.batch

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

try { await db.execute(`
  CREATE TABLE IF NOT EXISTS thread_snapshots (
    id        TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES story_threads(id) ON DELETE CASCADE,
    summary   TEXT NOT NULL,
    watch_for TEXT,
    week      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(thread_id, week)
  )
`) } catch {}

try { await db.execute(`
  CREATE TABLE IF NOT EXISTS source_runs (
    source     TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (source, fetched_at)
  )
`) } catch {}
try { await db.execute(`ALTER TABLE story_events ADD COLUMN source TEXT NOT NULL DEFAULT 'pipeline'`) } catch {}
try { await db.execute(`ALTER TABLE story_events ADD COLUMN source_url TEXT`) } catch {}
try { await db.execute(`ALTER TABLE feed_items ADD COLUMN screened INTEGER NOT NULL DEFAULT 1`) } catch {}
try { await db.execute(`ALTER TABLE story_threads ADD COLUMN acceleration_score REAL DEFAULT 0`) } catch {}
try { await db.execute(`
  CREATE TABLE IF NOT EXISTS daily_briefs (
    id         TEXT PRIMARY KEY,
    date       TEXT NOT NULL UNIQUE,
    signal     TEXT NOT NULL,
    rising     TEXT NOT NULL,
    watch      TEXT NOT NULL,
    shift      TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`) } catch {}
try {
  await db.execute(`DROP INDEX IF EXISTS idx_story_events_thread_week_sig`)
  await db.execute(`
    DELETE FROM story_events WHERE rowid NOT IN (
      SELECT MAX(rowid) FROM story_events GROUP BY thread_id, week, significance, source
    )
  `)
  await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_story_events_thread_week_sig_src ON story_events (thread_id, week, significance, source)`)
} catch {}

// FTS5 full-text search. Only create the virtual table and triggers once —
// never drop+rebuild on startup, which was O(n) in feed_items on every cold
// start. If the index becomes corrupt the try/catch lets search fall back to
// LIKE queries. A one-time populate-rebuild runs only when the table is new.
try {
  const { rows: ftsCheck } = await db.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='feed_items_fts'`
  )
  const isNew = ftsCheck.length === 0

  await db.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS feed_items_fts USING fts5(
      title, hook, raw_content,
      content='feed_items', content_rowid='rowid'
    )
  `)
  // Triggers use UPDATE OF so velocity_score changes never touch the vtab.
  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS fts_feed_ai AFTER INSERT ON feed_items BEGIN
      INSERT INTO feed_items_fts(rowid, title, hook, raw_content)
      VALUES (new.rowid, COALESCE(new.title,''), COALESCE(new.hook,''), COALESCE(new.raw_content,''));
    END
  `)
  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS fts_feed_ad AFTER DELETE ON feed_items BEGIN
      INSERT INTO feed_items_fts(feed_items_fts, rowid, title, hook, raw_content)
      VALUES ('delete', old.rowid, COALESCE(old.title,''), COALESCE(old.hook,''), COALESCE(old.raw_content,''));
    END
  `)
  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS fts_feed_au_del BEFORE UPDATE OF title, hook, raw_content ON feed_items BEGIN
      INSERT INTO feed_items_fts(feed_items_fts, rowid, title, hook, raw_content)
      VALUES ('delete', old.rowid, COALESCE(old.title,''), COALESCE(old.hook,''), COALESCE(old.raw_content,''));
    END
  `)
  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS fts_feed_au_ins AFTER UPDATE OF title, hook, raw_content ON feed_items BEGIN
      INSERT INTO feed_items_fts(rowid, title, hook, raw_content)
      VALUES (new.rowid, COALESCE(new.title,''), COALESCE(new.hook,''), COALESCE(new.raw_content,''));
    END
  `)
  if (isNew) {
    // Backfill existing rows into the freshly created index.
    await db.execute(`INSERT INTO feed_items_fts(feed_items_fts) VALUES ('rebuild')`)
    console.log('[db] FTS5 table created — initial rebuild complete')
  }
} catch (err) {
  console.warn('[db] FTS5 setup skipped (search falls back to LIKE):', err)
}
try { await db.execute(`ALTER TABLE project_ideas ADD COLUMN refinement_log TEXT DEFAULT '[]'`) } catch {}
try { await db.execute(`ALTER TABLE project_ideas ADD COLUMN source TEXT NOT NULL DEFAULT 'trending'`) } catch {}

// feed_items has grown large enough that the ingest pipeline's first query
// (lookup by source prefix) was doing a full table scan — index the columns
// every cron run actually filters/sorts on.
try { await db.execute(`CREATE INDEX IF NOT EXISTS idx_feed_items_source ON feed_items (source)`) } catch {}
try { await db.execute(`CREATE INDEX IF NOT EXISTS idx_feed_items_fetched_at ON feed_items (fetched_at)`) } catch {}
try { await db.execute(`CREATE INDEX IF NOT EXISTS idx_feed_items_screened ON feed_items (screened)`) } catch {}

// Memory layer: Claude's own past outputs (digest highlights, etc.), embedded
// via Voyage AI for semantic recall (lib/memory.ts). kind namespaces entries
// so future intelligence modules can share this table without collisions.
try { await db.execute(`
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    ref_id TEXT,
    text TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    embedding F32_BLOB(512) NOT NULL,
    created_at TEXT NOT NULL
  )
`) } catch {}
try { await db.execute(`CREATE INDEX IF NOT EXISTS memories_vec_idx ON memories(libsql_vector_idx(embedding, 'metric=cosine'))`) } catch {}
try { await db.execute(`CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories (kind)`) } catch {}

// feed_items: embedding column for semantic recall of raw ingested content
// (populated at ingest time in lib/pipeline.ts — see lib/memory.ts).
try { await db.execute(`ALTER TABLE feed_items ADD COLUMN embedding F32_BLOB(512)`) } catch {}
try { await db.execute(`CREATE INDEX IF NOT EXISTS feed_items_vec_idx ON feed_items(libsql_vector_idx(embedding, 'metric=cosine'))`) } catch {}

// Per-source screening outcomes and Claude token spend, written once per
// pipeline run (lib/intelligence/hooks.ts) — lets /api/stats answer "where is
// the noise/cost actually coming from" instead of guessing.
try { await db.execute(`
  CREATE TABLE IF NOT EXISTS screening_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at TEXT NOT NULL,
    source TEXT NOT NULL,
    accepted_count INTEGER NOT NULL DEFAULT 0,
    rejected_count INTEGER NOT NULL DEFAULT 0,
    fast_tracked_count INTEGER NOT NULL DEFAULT 0
  )
`) } catch {}
try { await db.execute(`CREATE INDEX IF NOT EXISTS idx_screening_stats_run_at ON screening_stats (run_at)`) } catch {}

try { await db.execute(`
  CREATE TABLE IF NOT EXISTS claude_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at TEXT NOT NULL,
    task TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0
  )
`) } catch {}
try { await db.execute(`CREATE INDEX IF NOT EXISTS idx_claude_usage_run_at ON claude_usage (run_at)`) } catch {}

export default db
