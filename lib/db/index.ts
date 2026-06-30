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
  // ── task_groups ──────────────────────────────────────────────────────────────
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS task_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER
    );
  `);
  sqlite.exec(`
    INSERT OR IGNORE INTO task_groups (id, name, "order", is_default, created_at)
    VALUES ('${DEFAULT_GROUP_ID}', 'Daily', 0, 1, ${Date.now()});
  `);

  // ── tasks ─────────────────────────────────────────────────────────────────────
  const taskCols = cols(sqlite, 'tasks');
  if (!taskCols.has('group_id')) {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN group_id TEXT REFERENCES task_groups(id);`);
    sqlite.exec(`UPDATE tasks SET group_id = '${DEFAULT_GROUP_ID}' WHERE group_id IS NULL;`);
  }
  if (!taskCols.has('goal_id'))      sqlite.exec(`ALTER TABLE tasks ADD COLUMN goal_id TEXT REFERENCES goals(id);`);
  if (!taskCols.has('important'))    sqlite.exec(`ALTER TABLE tasks ADD COLUMN important INTEGER NOT NULL DEFAULT 0;`);
  if (!taskCols.has('urgent'))       sqlite.exec(`ALTER TABLE tasks ADD COLUMN urgent INTEGER NOT NULL DEFAULT 0;`);
  if (!taskCols.has('due_date'))     sqlite.exec(`ALTER TABLE tasks ADD COLUMN due_date TEXT;`);

  // ── goals ─────────────────────────────────────────────────────────────────────
  const goalCols = cols(sqlite, 'goals');
  // paceType → paceShape rename (safe: DB had 0 rows when this ran)
  if (goalCols.has('pace_type') && !goalCols.has('pace_shape')) {
    sqlite.exec(`ALTER TABLE goals RENAME COLUMN pace_type TO pace_shape;`);
  }
  if (!goalCols.has('pace_param'))        sqlite.exec(`ALTER TABLE goals ADD COLUMN pace_param REAL;`);
  if (!goalCols.has('weight'))            sqlite.exec(`ALTER TABLE goals ADD COLUMN weight REAL NOT NULL DEFAULT 1;`);
  if (!goalCols.has('start_date'))        sqlite.exec(`ALTER TABLE goals ADD COLUMN start_date TEXT;`);
  if (!goalCols.has('end_date'))          sqlite.exec(`ALTER TABLE goals ADD COLUMN end_date TEXT;`);
  if (!goalCols.has('cadence_per_week'))  sqlite.exec(`ALTER TABLE goals ADD COLUMN cadence_per_week REAL;`);

  // ── inputs ────────────────────────────────────────────────────────────────────
  const inputCols = cols(sqlite, 'inputs');
  if (!inputCols.has('kind'))           sqlite.exec(`ALTER TABLE inputs ADD COLUMN kind TEXT;`);
  if (!inputCols.has('value'))          sqlite.exec(`ALTER TABLE inputs ADD COLUMN value REAL;`);
  if (!inputCols.has('occurred_count')) sqlite.exec(`ALTER TABLE inputs ADD COLUMN occurred_count REAL;`);
  if (!inputCols.has('duration_min'))   sqlite.exec(`ALTER TABLE inputs ADD COLUMN duration_min REAL;`);

  // ── scores ────────────────────────────────────────────────────────────────────
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
