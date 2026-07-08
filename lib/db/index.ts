import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const globalDb = globalThis as typeof globalThis & { _db?: ReturnType<typeof drizzle> };

export const DEFAULT_GROUP_ID = 'daily';

function cols(sqlite: InstanceType<typeof Database>, table: string): Set<string> {
  return new Set(
    (sqlite.pragma(`table_info(${table})`) as Array<{ name: string }>).map(c => c.name)
  );
}

function migrate(sqlite: InstanceType<typeof Database>) {
  // ── Create all tables (fresh DB path) ────────────────────────────────────────
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      timezone TEXT NOT NULL,
      distance_unit TEXT NOT NULL DEFAULT 'km',
      currency TEXT NOT NULL DEFAULT 'EUR',
      week_start TEXT NOT NULL DEFAULT 'mon',
      time_format TEXT NOT NULL DEFAULT '24h',
      lenna_tone TEXT NOT NULL DEFAULT 'warm',
      lenna_autonomy TEXT NOT NULL DEFAULT 'draft',
      date_of_birth TEXT,
      setup_done INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS vectors (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      color TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS anchors (
      id TEXT PRIMARY KEY,
      vector_id TEXT NOT NULL REFERENCES vectors(id),
      description TEXT NOT NULL,
      headline_metric TEXT,
      target_age INTEGER,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      vector_id TEXT NOT NULL REFERENCES vectors(id),
      anchor_id TEXT REFERENCES anchors(id),
      quarter TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      trackability_tier TEXT,
      data_source TEXT,
      proxy_model TEXT,
      attestation_cadence TEXT,
      pace_shape TEXT NOT NULL DEFAULT 'linear',
      pace_param REAL,
      weight REAL NOT NULL DEFAULT 1,
      start_date TEXT,
      end_date TEXT,
      target_value REAL,
      start_value REAL,
      cadence_per_week REAL,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      quarter TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      phase TEXT NOT NULL DEFAULT 'orient',
      report TEXT,
      committed_goal_ids TEXT,
      created_at INTEGER,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS inputs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT,
      vector_id TEXT REFERENCES vectors(id),
      goal_id TEXT REFERENCES goals(id),
      raw_text TEXT,
      kind TEXT,
      progress_delta REAL,
      value REAL,
      occurred_count REAL,
      duration_min REAL,
      confidence REAL,
      metadata TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS task_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES task_groups(id),
      goal_id TEXT REFERENCES goals(id),
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      important INTEGER NOT NULL DEFAULT 0,
      urgent INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      operating_level REAL NOT NULL,
      operating_level_raw REAL,
      alignment REAL,
      contributors TEXT,
      vector_breakdown TEXT NOT NULL DEFAULT '{}',
      explanation TEXT,
      created_at INTEGER
    );
  `);

  // ── Seed default task group ───────────────────────────────────────────────────
  sqlite.exec(`
    INSERT OR IGNORE INTO task_groups (id, name, "order", is_default, created_at)
    VALUES ('${DEFAULT_GROUP_ID}', 'Daily', 0, 1, ${Date.now()});
  `);

  // ── Additive upgrades for existing DBs ───────────────────────────────────────
  // tasks
  const taskCols = cols(sqlite, 'tasks');
  if (!taskCols.has('group_id')) {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN group_id TEXT REFERENCES task_groups(id);`);
    sqlite.exec(`UPDATE tasks SET group_id = '${DEFAULT_GROUP_ID}' WHERE group_id IS NULL;`);
  }
  if (!taskCols.has('goal_id'))   sqlite.exec(`ALTER TABLE tasks ADD COLUMN goal_id TEXT REFERENCES goals(id);`);
  if (!taskCols.has('important')) sqlite.exec(`ALTER TABLE tasks ADD COLUMN important INTEGER NOT NULL DEFAULT 0;`);
  if (!taskCols.has('urgent'))    sqlite.exec(`ALTER TABLE tasks ADD COLUMN urgent INTEGER NOT NULL DEFAULT 0;`);
  if (!taskCols.has('due_date'))  sqlite.exec(`ALTER TABLE tasks ADD COLUMN due_date TEXT;`);

  // goals
  const goalCols = cols(sqlite, 'goals');
  if (goalCols.has('pace_type') && !goalCols.has('pace_shape')) {
    sqlite.exec(`ALTER TABLE goals RENAME COLUMN pace_type TO pace_shape;`);
  }
  if (!goalCols.has('status'))               sqlite.exec(`ALTER TABLE goals ADD COLUMN status TEXT NOT NULL DEFAULT 'active';`);
  if (!goalCols.has('trackability_tier'))    sqlite.exec(`ALTER TABLE goals ADD COLUMN trackability_tier TEXT;`);
  if (!goalCols.has('data_source'))          sqlite.exec(`ALTER TABLE goals ADD COLUMN data_source TEXT;`);
  if (!goalCols.has('proxy_model'))          sqlite.exec(`ALTER TABLE goals ADD COLUMN proxy_model TEXT;`);
  if (!goalCols.has('attestation_cadence'))  sqlite.exec(`ALTER TABLE goals ADD COLUMN attestation_cadence TEXT;`);
  if (!goalCols.has('pace_param'))           sqlite.exec(`ALTER TABLE goals ADD COLUMN pace_param REAL;`);
  if (!goalCols.has('weight'))           sqlite.exec(`ALTER TABLE goals ADD COLUMN weight REAL NOT NULL DEFAULT 1;`);
  if (!goalCols.has('start_date'))       sqlite.exec(`ALTER TABLE goals ADD COLUMN start_date TEXT;`);
  if (!goalCols.has('end_date'))         sqlite.exec(`ALTER TABLE goals ADD COLUMN end_date TEXT;`);
  if (!goalCols.has('cadence_per_week')) sqlite.exec(`ALTER TABLE goals ADD COLUMN cadence_per_week REAL;`);

  // sessions
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      quarter TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      phase TEXT NOT NULL DEFAULT 'orient',
      report TEXT,
      committed_goal_ids TEXT,
      created_at INTEGER,
      completed_at INTEGER
    );
  `);

  // inputs
  const inputCols = cols(sqlite, 'inputs');
  if (!inputCols.has('kind'))           sqlite.exec(`ALTER TABLE inputs ADD COLUMN kind TEXT;`);
  if (!inputCols.has('value'))          sqlite.exec(`ALTER TABLE inputs ADD COLUMN value REAL;`);
  if (!inputCols.has('occurred_count')) sqlite.exec(`ALTER TABLE inputs ADD COLUMN occurred_count REAL;`);
  if (!inputCols.has('duration_min'))   sqlite.exec(`ALTER TABLE inputs ADD COLUMN duration_min REAL;`);

  // task_groups
  const tgCols = cols(sqlite, 'task_groups');
  if (!tgCols.has('parent_id')) sqlite.exec(`ALTER TABLE task_groups ADD COLUMN parent_id TEXT REFERENCES task_groups(id);`);

  // user
  const userCols = cols(sqlite, 'user');
  if (!userCols.has('date_of_birth')) sqlite.exec(`ALTER TABLE user ADD COLUMN date_of_birth TEXT;`);
  if (!userCols.has('dark_mode'))    sqlite.exec(`ALTER TABLE user ADD COLUMN dark_mode INTEGER NOT NULL DEFAULT 0;`);

  // scores
  const scoreCols = cols(sqlite, 'scores');
  if (!scoreCols.has('operating_level_raw')) sqlite.exec(`ALTER TABLE scores ADD COLUMN operating_level_raw REAL;`);
  if (!scoreCols.has('alignment'))           sqlite.exec(`ALTER TABLE scores ADD COLUMN alignment REAL;`);
  if (!scoreCols.has('contributors'))        sqlite.exec(`ALTER TABLE scores ADD COLUMN contributors TEXT;`);
}

function getDb() {
  if (!globalDb._db) {
    const sqlite = new Database("./lifeos.db");
    sqlite.pragma("journal_mode = WAL");
    migrate(sqlite);
    globalDb._db = drizzle(sqlite, { schema });
  }
  return globalDb._db;
}

export const db = getDb();
export { schema };
