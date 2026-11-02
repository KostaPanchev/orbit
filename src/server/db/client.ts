import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { chmodSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

export function databasePath() {
  if (activeDataset() === "live-aula") {
    if (process.env.ORBIT_DB_PATH && resolve(process.env.ORBIT_DB_PATH) !== resolve(".orbit/live.sqlite")) {
      throw new Error("Live storage is restricted to the protected .orbit/live.sqlite file.");
    }
    return ".orbit/live.sqlite";
  }
  return process.env.ORBIT_DB_PATH ?? ".orbit/orbit.sqlite";
}
export function openDatabase(path = databasePath()) {
  if (path !== ":memory:") mkdirSync(dirname(resolve(/* turbopackIgnore: true */ path)), { recursive: true, mode: 0o700 });
  if (path !== ":memory:") for (const file of [path, `${path}-wal`, `${path}-shm`]) {
    const info = lstatSync(file, { throwIfNoEntry: false });
    if (info && (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== process.getuid?.())) {
      throw new Error("Database storage must be a private, user-owned regular file.");
    }
    if (info) chmodSync(file, 0o600);
  }
  const mask = process.umask(0o077);
  let sqlite: Database.Database | undefined;
  try {
    sqlite = new Database(path);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("secure_delete = ON");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");
    return drizzle(sqlite, { schema });
  } catch (error) {
    sqlite?.close();
    throw error;
  } finally { process.umask(mask); }
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
  if (id !== "live-aula" && !/^synthetic-[a-z0-9-]+$/.test(id)) throw new Error("ORBIT_DATASET must be synthetic-* or the isolated live-aula dataset.");
  return id;
}
