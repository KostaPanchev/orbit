import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

export function openDatabase(path = process.env.ORBIT_DB_PATH ?? ".orbit/orbit.sqlite") {
  if (path !== ":memory:") mkdirSync(dirname(resolve(/* turbopackIgnore: true */ path)), { recursive: true, mode: 0o700 });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema });
}
export type OrbitDb = ReturnType<typeof openDatabase>;
export function migrateDatabase(db: OrbitDb) {
  migrate(db, { migrationsFolder: resolve("src/server/db/migrations") });
}
let database: OrbitDb | undefined;
export function getDatabase() {
  database ??= openDatabase();
  return database;
}
export function activeDataset() {
  const id = process.env.ORBIT_DATASET ?? "synthetic-default";
  if (!/^synthetic-[a-z0-9-]+$/.test(id)) throw new Error("ORBIT_DATASET must be a synthetic-* dataset. Live ingestion is disabled.");
  return id;
}
