import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { DomainError } from "../domain/model";
import { activeDataset, migrateDatabase, openDatabase } from "../server/db/client";
import { ensureDataset } from "../server/services/organizer";
import { acquireLease, LEASE_MS, processNextJob, releaseLease, renewLease, requestScheduledRefresh } from "./runner";

async function main() {
  const db = openDatabase();
  migrateDatabase(db);
  const dataset = activeDataset();
  ensureDataset(db, dataset);
  const owner = randomUUID();
  if (!acquireLease(db, owner)) {
    db.$client.close();
    throw new DomainError("Another Orbit worker holds the lease. Stop it or wait up to 60 seconds after an interrupted shutdown.", 409);
  }
  let stopping = false;
  let leaseError: unknown;
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  const heartbeat = setInterval(() => {
    try { renewLease(db, owner); }
    catch (error) { leaseError = error; stopping = true; }
  }, LEASE_MS / 3);
  try {
    requestScheduledRefresh(db, dataset, owner);
    await processNextJob(db, dataset, owner);
    process.send?.("ready");
    console.log("Orbit worker ready: synthetic data only, refresh every 30 minutes while running.");
    while (!stopping) {
      renewLease(db, owner);
      requestScheduledRefresh(db, dataset, owner);
      await processNextJob(db, dataset, owner);
      await delay(500);
    }
    if (leaseError) throw leaseError;
  } finally {
    clearInterval(heartbeat);
    releaseLease(db, owner);
    db.$client.close();
  }
}
main().catch((error: unknown) => {
  console.error("Orbit worker stopped:", error instanceof DomainError ? error.message : error instanceof Error ? error.name : "Unknown worker error");
  console.error("Check local storage, worker ownership, and startup configuration. Source content is not logged.");
  process.exitCode = 1;
});
