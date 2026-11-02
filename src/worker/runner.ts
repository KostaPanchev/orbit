import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DomainError } from "../domain/model";
import type { OrbitDb } from "../server/db/client";
import { jobs, workerLease } from "../server/db/schema";
import { enqueue, ensureDataset, requireDataset } from "../server/services/organizer";
import { assertLease, recoverInterrupted, resetSynthetic, seedHistory, synchronize } from "../server/services/sync";
import { disconnectLive, synchronizeLive } from "../server/services/live-sync";
import { deleteLiveData } from "../server/services/retention";

export const LEASE_MS = 60_000;

export function acquireLease(db: OrbitDb, owner: string, now = Date.now()) {
  return db.$client.transaction(() => {
    const lease = db.select().from(workerLease).get();
    if (lease && lease.expiresAt > now && lease.owner !== owner) return false;
    db.insert(workerLease).values({ id: 1, owner, expiresAt: now + LEASE_MS })
      .onConflictDoUpdate({ target: workerLease.id, set: { owner, expiresAt: now + LEASE_MS } }).run();
    recoverInterrupted(db);
    return true;
  }).immediate();
}
export function renewLease(db: OrbitDb, owner: string) {
  db.$client.transaction(() => {
    const lease = db.select().from(workerLease).get();
    if (!lease || lease.owner !== owner) throw new DomainError("Worker lease lost.", 409);
    db.update(workerLease).set({ expiresAt: Date.now() + LEASE_MS }).where(eq(workerLease.owner, owner)).run();
  }).immediate();
}
export function releaseLease(db: OrbitDb, owner: string) {
  db.delete(workerLease).where(eq(workerLease.owner, owner)).run();
}
export function requestScheduledRefresh(db: OrbitDb, dataset: string, owner: string, now = Date.now()) {
  db.$client.transaction(() => {
    assertLease(db, owner);
    const data = requireDataset(db, dataset);
    const pending = db.select().from(jobs).where(and(eq(jobs.dataset, dataset), inArray(jobs.status, ["queued", "running"]))).get();
    if (!data.paused && data.nextRefresh <= now && !pending) enqueue(db, dataset, "refresh", now);
  }).immediate();
}
export async function processNextJob(db: OrbitDb, dataset: string, owner: string, signal?: AbortSignal) {
  const job = db.$client.transaction(() => {
    assertLease(db, owner);
    const next = db.select().from(jobs).where(and(eq(jobs.dataset, dataset), eq(jobs.status, "queued"))).orderBy(asc(jobs.createdAt)).get();
    if (next) db.update(jobs).set({ status: "running" }).where(eq(jobs.id, next.id)).run();
    return next;
  }).immediate();
  if (!job) return false;
  try {
    const data = requireDataset(db, dataset);
    if (data.kind === "live") {
      if (job.type === "delete-live") deleteLiveData(db, dataset);
      else if (job.type === "disconnect") await disconnectLive(db, dataset, owner);
      else if (job.type === "refresh") await synchronizeLive(db, dataset, owner, signal);
      else throw new DomainError("Synthetic reset is disabled for live data.");
    } else {
      if (job.type === "reset") resetSynthetic(db, dataset, owner);
      seedHistory(db, dataset, owner);
      await synchronize(db, dataset, owner);
    }
    db.$client.transaction(() => {
      assertLease(db, owner);
      db.update(jobs).set({ status: "done" }).where(eq(jobs.id, job.id)).run();
      db.delete(jobs).where(and(eq(jobs.dataset, dataset), eq(jobs.status, "done"), lte(jobs.createdAt, Date.now() - 7 * 86400_000))).run();
    }).immediate();
    return true;
  } catch (error) {
    db.$client.transaction(() => {
      assertLease(db, owner);
      db.update(jobs).set({ status: "failed", error: "Local refresh failed. Check the worker terminal." }).where(eq(jobs.id, job.id)).run();
    }).immediate();
    throw error;
  }
}
export async function initialize(db: OrbitDb, dataset: string) {
  ensureDataset(db, dataset);
  const owner = randomUUID();
  if (!acquireLease(db, owner)) throw new Error("Another Orbit worker is running. Stop it before setup.");
  const heartbeat = setInterval(() => renewLease(db, owner), LEASE_MS / 3);
  try {
    db.$client.transaction(() => enqueue(db, dataset, "refresh")).immediate();
    await processNextJob(db, dataset, owner);
  } finally {
    clearInterval(heartbeat);
    releaseLease(db, owner);
  }
}
