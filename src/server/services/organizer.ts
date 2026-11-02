import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DomainError, REFRESH_INTERVAL, mutationSchema, snapshotSchema, sourceKinds, type Coverage, type Mutation } from "../../domain/model";
import type { OrbitDb } from "../db/client";
import { agenda, briefs, candidates, datasets, decisions, jobs, sources, syncRuns, workerLease } from "../db/schema";

export function requireSynthetic(db: OrbitDb, dataset: string) {
  const row = db.select().from(datasets).where(eq(datasets.id, dataset)).get();
  if (!row) throw new DomainError("Dataset is not initialized. Run pnpm db:setup.", 503);
  if (row.kind !== "synthetic") throw new DomainError("Live datasets are disabled in Phase 2.", 403);
  return row;
}

export function ensureDataset(db: OrbitDb, dataset: string) {
  if (!/^synthetic-[a-z0-9-]+$/.test(dataset)) throw new DomainError("Only synthetic-* datasets can be created.");
  db.insert(datasets).values({ id: dataset, kind: "synthetic", generation: randomUUID() }).onConflictDoNothing().run();
  requireSynthetic(db, dataset);
}

export function latestCoverage(db: OrbitDb, dataset: string): Coverage[] {
  const latest = db.select().from(syncRuns).where(eq(syncRuns.dataset, dataset)).orderBy(desc(syncRuns.startedAt), desc(sql`rowid`)).get();
  return sourceKinds.map((kind) => latest?.coverage.find((item) => item.kind === kind)
    ?? { kind, pages: 0, items: 0, complete: false, error: null, checkedAt: null, lastSuccess: null });
}

export function getSnapshot(db: OrbitDb, dataset: string, now = Date.now()) {
  const data = requireSynthetic(db, dataset);
  const pending = db.select().from(jobs).where(and(eq(jobs.dataset, dataset), inArray(jobs.status, ["queued", "running"]))).get();
  const latestJob = db.select().from(jobs).where(eq(jobs.dataset, dataset)).orderBy(desc(jobs.createdAt), desc(sql`rowid`)).get();
  const run = db.select().from(syncRuns).where(eq(syncRuns.dataset, dataset)).orderBy(desc(syncRuns.startedAt), desc(sql`rowid`)).get();
  const lease = db.select().from(workerLease).get();
  const current = db.select().from(candidates).where(eq(candidates.dataset, dataset)).all();
  const saved = db.select().from(agenda).where(eq(agenda.dataset, dataset)).all();
  const reviews = db.select().from(decisions).where(eq(decisions.dataset, dataset)).all();
  return snapshotSchema.parse({
    dataset, scenario: data.scenario, agenda: saved.map((row) => row.payload),
    suggestions: current.map((row) => ({
      ...row.payload,
      editedFields: saved.find((entry) => entry.candidateId === row.id)?.editedFields ?? [],
    })),
    brief: db.select().from(briefs).where(eq(briefs.dataset, dataset)).all().flatMap((row) => row.items),
    decisions: Object.fromEntries(current.flatMap((item) => {
      const decision = reviews.find((row) => row.candidateId === item.id && row.revision === item.revision);
      return decision ? [[item.id, decision.decision]] : [];
    })),
    lastSuccess: data.lastSuccess, briefAt: data.briefAt, coverage: latestCoverage(db, dataset),
    syncError: latestJob?.error ?? run?.error ?? null, job: pending?.status ?? null,
    workerOnline: Boolean(lease && lease.expiresAt > now),
    stale: !data.lastSuccess || now - Date.parse(data.lastSuccess) > REFRESH_INTERVAL + 60_000 || data.scenario === "stale",
  });
}

export function enqueue(db: OrbitDb, dataset: string, type: "refresh" | "reset", now = Date.now()) {
  requireSynthetic(db, dataset);
  const existing = db.select().from(jobs).where(and(eq(jobs.dataset, dataset), inArray(jobs.status, ["queued", "running"]))).get();
  if (existing) {
    if (existing.type !== type) throw new DomainError("Wait for the current refresh or reset to finish.", 409);
    return existing.id;
  }
  const id = randomUUID();
  db.insert(jobs).values({ id, dataset, type, createdAt: now }).run();
  return id;
}

export function mutate(db: OrbitDb, dataset: string, input: Mutation) {
  const action = mutationSchema.parse(input);
  db.$client.transaction(() => {
    const data = requireSynthetic(db, dataset);
    if (action.type === "refresh" || action.type === "reset") { enqueue(db, dataset, action.type); return; }
    if (action.type === "scenario") {
      if (db.select().from(jobs).where(and(eq(jobs.dataset, dataset), inArray(jobs.status, ["queued", "running"]))).get()) {
        throw new DomainError("Wait for the current refresh or reset before changing scenarios.", 409);
      }
      db.update(datasets).set({ scenario: action.scenario }).where(eq(datasets.id, dataset)).run();
      enqueue(db, dataset, "refresh");
      return;
    }
    if (data.initialized && db.select().from(jobs).where(and(eq(jobs.dataset, dataset), eq(jobs.type, "reset"), inArray(jobs.status, ["queued", "running"]))).get()) {
      throw new DomainError("A synthetic reset is pending. Wait for it to finish before reviewing.", 409);
    }
    const candidate = db.select().from(candidates).where(and(eq(candidates.dataset, dataset), eq(candidates.id, action.id))).get();
    if (!candidate || candidate.revision !== action.revision) {
      throw new DomainError("This suggestion has changed. Reload the latest evidence before deciding.", 409);
    }
    const decided = db.select().from(decisions).where(and(eq(decisions.dataset, dataset), eq(decisions.candidateId, action.id), eq(decisions.revision, action.revision))).get();
    if (decided) throw new DomainError("This revision already has a saved decision. Reload to see it.", 409);
    const item = candidate.payload;
    const source = db.select().from(sources).where(and(eq(sources.dataset, dataset), eq(sources.key, item.sourceKey))).get();
    if (!source || JSON.stringify(source.record.source) !== JSON.stringify(item.source)) {
      throw new DomainError("The source changed and processing is incomplete. Refresh before deciding.", 409);
    }
    if (action.type === "approve") {
      if (!item.date && !action.dateConfirmed) throw new DomainError("Confirm the unresolved date separately before approving.");
      const id = item.replacesId ?? `approved-${item.id}`;
      const fields = ["title", "date", "time", "location"] as const;
      const editedFields = fields.filter((field) => action.details[field] !== item[field]);
      const entry = {
        dataset, id, candidateId: item.id, revision: item.revision, editedFields,
        payload: { ...action.details, id, child: item.child, source: item.source, origin: "Approved suggestion" as const },
      };
      db.insert(agenda).values(entry).onConflictDoUpdate({ target: [agenda.dataset, agenda.id], set: entry }).run();
    }
    db.insert(decisions).values({
      dataset, candidateId: item.id, revision: item.revision,
      decision: action.type === "approve" ? "approved" : "dismissed", candidate: item,
      details: action.type === "approve" ? action.details : null, decidedAt: new Date().toISOString(),
    }).run();
  }).immediate();
  return getSnapshot(db, dataset);
}
