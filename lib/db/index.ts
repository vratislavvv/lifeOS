import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// Module-level singleton — Next.js hot-reload can create multiple instances
// in dev; globalThis caching prevents runaway file handles.
const globalDb = globalThis as typeof globalThis & { _db?: ReturnType<typeof drizzle> };

function getDb() {
  if (!globalDb._db) {
    const sqlite = new Database("./lifeos.db");
    sqlite.pragma("journal_mode = WAL");
    globalDb._db = drizzle(sqlite, { schema });
  }
  return globalDb._db;
}

export const db = getDb();
export { schema };
