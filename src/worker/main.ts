import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { DomainError } from "../domain/model";
import { activeDataset, migrateDatabase, openDatabase } from "../server/db/client";
import { ensureDataset } from "../server/services/organizer";
import { pruneLiveData } from "../server/services/retention";
import { prepareSessionDirectory, requireHostSafeguards, sessionPaths, withSessionLock } from "../server/aula/session";
import { acquireLease, LEASE_MS, processNextJob, releaseLease, renewLease, requestScheduledRefresh } from "./runner";

async function main() {
  const dataset = activeDataset();
  if (dataset === "live-aula") {
    const paths = sessionPaths(resolve("."));
    await withSessionLock(paths, async () => { prepareSessionDirectory(paths); requireHostSafeguards(paths); });
  }
  const db = openDatabase();
  migrateDatabase(db);
  ensureDataset(db, dataset);
  if (dataset === "live-aula") pruneLiveData(db, dataset);
  const owner = randomUUID();
  if (!acquireLease(db, owner)) {
    db.$client.close();
    throw new DomainError("Another Orbit worker holds the lease. Stop it or wait up to 60 seconds after an interrupted shutdown.", 409);
  }
  let stopping = false;
  const controller = new AbortController();
  let leaseError: unknown;
  const stop = () => { stopping = true; controller.abort(); };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  const heartbeat = setInterval(() => {
    try { renewLease(db, owner); }
    catch (error) { leaseError = error; stopping = true; controller.abort(); }
  }, LEASE_MS / 3);
  try {
    requestScheduledRefresh(db, dataset, owner);
    if (dataset === "live-aula") process.send?.("ready");
    await processNextJob(db, dataset, owner, controller.signal);
    if (dataset !== "live-aula") process.send?.("ready");
    console.log(`Orbit worker ready: ${dataset === "live-aula" ? "read-only Aula, AI disabled" : "synthetic data only"}, refresh every 30 minutes while running.`);
    let retentionChecked = Date.now();
    while (!stopping) {
      renewLease(db, owner);
      if (dataset === "live-aula" && Date.now() - retentionChecked >= 60_000) {
        pruneLiveData(db, dataset);
        retentionChecked = Date.now();
      }
      requestScheduledRefresh(db, dataset, owner);
      await processNextJob(db, dataset, owner, controller.signal);
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
