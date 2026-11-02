import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { DomainError, LIVE_RETENTION_MS } from "../../domain/model";
import type { OrbitDb } from "../db/client";
import { agenda, briefs, candidates, datasets, decisions, jobs, sources, syncRuns } from "../db/schema";

export function removeLiveSources(db: OrbitDb, dataset: string, keys: string[]) {
  if (!keys.length) return;
  const data = db.select().from(datasets).where(eq(datasets.id, dataset)).get();
  if (data?.kind !== "live") throw new DomainError("Live deletion cannot target a synthetic dataset.");
  const selected = new Set(keys);
  for (const candidate of db.select().from(candidates).where(eq(candidates.dataset, dataset)).all()) {
    if (selected.has(candidate.payload.sourceKey)) db.delete(candidates).where(and(eq(candidates.dataset, dataset), eq(candidates.id, candidate.id))).run();
  }
  for (const decision of db.select().from(decisions).where(eq(decisions.dataset, dataset)).all()) {
    if (selected.has(decision.candidate.sourceKey)) db.delete(decisions).where(and(eq(decisions.dataset, dataset), eq(decisions.candidateId, decision.candidateId), eq(decisions.revision, decision.revision))).run();
  }
  db.delete(agenda).where(and(eq(agenda.dataset, dataset), inArray(agenda.sourceKey, keys))).run();
  db.delete(briefs).where(and(eq(briefs.dataset, dataset), inArray(briefs.sourceKey, keys))).run();
  db.delete(sources).where(and(eq(sources.dataset, dataset), inArray(sources.key, keys))).run();
}
export function checkpointPrivateData(db: OrbitDb) {
  const results = z.array(z.object({ busy: z.number().int() })).safeParse(db.$client.pragma("wal_checkpoint(TRUNCATE)"));
  if (!results.success || results.data.some((result) => result.busy !== 0)) throw new DomainError("Private storage cleanup is waiting for a database reader. Retry after other local operations finish.", 503);
}
export function pruneLiveData(db: OrbitDb, dataset: string, now = Date.now()) {
  db.$client.transaction(() => {
    const data = db.select().from(datasets).where(eq(datasets.id, dataset)).get();
    if (data?.kind !== "live") throw new DomainError("Live retention cannot target a synthetic dataset.");
    const expired = db.select({ key: sources.key }).from(sources).where(and(eq(sources.dataset, dataset), or(isNull(sources.expiresAt), lte(sources.expiresAt, now)))).all();
    removeLiveSources(db, dataset, expired.map((row) => row.key));
    db.delete(syncRuns).where(and(eq(syncRuns.dataset, dataset), lte(syncRuns.startedAt, new Date(now - LIVE_RETENTION_MS).toISOString()))).run();
    db.delete(jobs).where(and(eq(jobs.dataset, dataset), inArray(jobs.status, ["done", "failed"]), lte(jobs.createdAt, now - LIVE_RETENTION_MS))).run();
    if (data.householdAt !== null && data.householdAt + LIVE_RETENTION_MS <= now) {
      const remaining = db.select({ key: sources.key }).from(sources).where(eq(sources.dataset, dataset)).get();
      db.update(datasets).set({
        household: null, householdAt: remaining ? data.householdAt : null,
        ...(!remaining ? { accountScope: null, lastSuccess: null, briefAt: null, initialized: false, generation: randomUUID() } : {}),
      }).where(eq(datasets.id, dataset)).run();
    }
  }).immediate();
  checkpointPrivateData(db);
}
export function deleteLiveData(db: OrbitDb, dataset: string) {
  db.$client.transaction(() => {
    const data = db.select().from(datasets).where(eq(datasets.id, dataset)).get();
    if (data?.kind !== "live") throw new DomainError("Live deletion cannot target a synthetic dataset.");
    for (const table of [sources, candidates, decisions, agenda, briefs, syncRuns]) db.delete(table).where(eq(table.dataset, dataset)).run();
    db.update(datasets).set({
      accountScope: null, household: null, householdAt: null, lastSuccess: null, briefAt: null,
      paused: true, initialized: false, nextRefresh: 0, generation: randomUUID(),
    }).where(eq(datasets.id, dataset)).run();
  }).immediate();
  checkpointPrivateData(db);
}
