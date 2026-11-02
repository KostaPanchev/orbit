import { activeDataset, migrateDatabase, openDatabase } from "../server/db/client";
import { initialize } from "./runner";

async function main() {
  const db = openDatabase();
  try {
    migrateDatabase(db);
    await initialize(db, activeDataset());
    console.log("Orbit synthetic database is ready.");
  } finally { db.$client.close(); }
}
main().catch((error: unknown) => {
  console.error("Orbit setup failed:", error instanceof Error ? error.name : "Unknown error");
  process.exitCode = 1;
});
