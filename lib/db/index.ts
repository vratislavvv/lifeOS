import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const globalDb = globalThis as typeof globalThis & { _db?: ReturnType<typeof drizzle> };

const DEFAULT_GROUP_ID = 'daily';

function migrate(sqlite: InstanceType<typeof Database>) {
  // task_groups table
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

  // Seed default group
  sqlite.exec(`
    INSERT OR IGNORE INTO task_groups (id, name, "order", is_default, created_at)
    VALUES ('${DEFAULT_GROUP_ID}', 'Daily', 0, 1, ${Date.now()});
  `);

  // Add new columns to tasks if they don't exist
  const cols = new Set(
    (sqlite.pragma('table_info(tasks)') as Array<{ name: string }>).map(c => c.name)
  );
  if (!cols.has('group_id')) {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN group_id TEXT REFERENCES task_groups(id);`);
    sqlite.exec(`UPDATE tasks SET group_id = '${DEFAULT_GROUP_ID}' WHERE group_id IS NULL;`);
  }
  if (!cols.has('important')) {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN important INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!cols.has('urgent')) {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN urgent INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!cols.has('due_date')) {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN due_date TEXT;`);
  }
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
export { DEFAULT_GROUP_ID };
