import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { DomainError, REFRESH_INTERVAL, LIVE_RETENTION_MS, DEMO_DATE, WINDOW_END, children, mutationSchema, snapshotSchema, sourceKinds, liveSourceKinds, type Coverage, type Mutation } from "../../domain/model";
import { liveWindow } from "../../domain/dates";
import { eventInWindow } from "../../domain/presentation";
import type { OrbitDb } from "../db/client";
import { agenda, briefs, candidates, datasets, decisions, jobs, sources, syncRuns, workerLease } from "../db/schema";

export function requireDataset(db: OrbitDb, dataset: string) {
  const row = db.select().from(datasets).where(eq(datasets.id, dataset)).get();
  if (!row) throw new DomainError("Dataset is not initialized. Run pnpm db:setup.", 503);
  return row;
}
export function requireSynthetic(db: OrbitDb, dataset: string) {
  const row = requireDataset(db, dataset);
  if (row.kind !== "synthetic") throw new DomainError("Synthetic controls are disabled for live datasets.", 403);
  return row;
}

export function ensureDataset(db: OrbitDb, dataset: string) {
  if (dataset !== "live-aula" && !/^synthetic-[a-z0-9-]+$/.test(dataset)) throw new DomainError("Only synthetic-* or live-aula datasets can be created.");
  const kind = dataset === "live-aula" ? "live" : "synthetic";
  db.insert(datasets).values({ id: dataset, kind, generation: randomUUID() }).onConflictDoNothing().run();
  if (requireDataset(db, dataset).kind !== kind) throw new DomainError("Dataset kind does not match its configured identity.", 409);
}

export function latestCoverage(db: OrbitDb, dataset: string): Coverage[] {
  const latest = db.select().from(syncRuns).where(eq(syncRuns.dataset, dataset)).orderBy(desc(syncRuns.startedAt), desc(sql`rowid`)).get();
  const kinds = requireDataset(db, dataset).kind === "live" ? liveSourceKinds : sourceKinds;
  return kinds.map((kind) => latest?.coverage.find((item) => item.kind === kind)
    ?? { kind, pages: 0, items: 0, complete: false, error: null, checkedAt: null, lastSuccess: null });
}

export function getSnapshot(db: OrbitDb, dataset: string, now = Date.now(), connected?: boolean) {
  const data = requireDataset(db, dataset);
  const live = data.kind === "live";
  const retained = live ? db.select().from(sources).where(and(eq(sources.dataset, dataset), gt(sources.expiresAt, now))).all() : [];
  const activeKeys = retained.map((row) => row.key);
  const window = live ? liveWindow(new Date(now)) : { today: DEMO_DATE, windowEnd: WINDOW_END };
  const pending = db.select().from(jobs).where(and(eq(jobs.dataset, dataset), inArray(jobs.status, ["queued", "running"]))).get();
  const latestJob = db.select().from(jobs).where(eq(jobs.dataset, dataset)).orderBy(desc(jobs.createdAt), desc(sql`rowid`)).get();
  const run = db.select().from(syncRuns).where(eq(syncRuns.dataset, dataset)).orderBy(desc(syncRuns.startedAt), desc(sql`rowid`)).get();
  const lease = db.select().from(workerLease).get();
  const current = live ? [] : db.select().from(candidates).where(eq(candidates.dataset, dataset)).all();
  const saved = db.select().from(agenda).where(and(eq(agenda.dataset, dataset), live ? inArray(agenda.sourceKey, activeKeys) : undefined)).all();
  const reviews = live ? [] : db.select().from(decisions).where(eq(decisions.dataset, dataset)).all();
  return snapshotSchema.parse({
    mode: data.kind, ...window, paused: data.paused,
    connected: live ? connected ?? (existsSync(".orbit/aula-auth/tokens.json") && existsSync(".orbit/aula-auth/.key")) : false,
    household: live ? data.household && data.householdAt !== null && data.householdAt + LIVE_RETENTION_MS > now ? data.household : {} : children,
    previews: live ? retained.filter((row) => row.record.source.kind === "Message" || row.record.source.kind === "Post")
      .toSorted((a, b) => b.record.source.timestamp.localeCompare(a.record.source.timestamp)).slice(0, 100)
      .map((row) => ({ id: row.key, child: row.record.child, source: row.record.source })) : [],
    dataset, scenario: data.scenario, agenda: saved.map((row) => row.payload).filter((entry) => !live || eventInWindow(entry, window.today, window.windowEnd)),
    schoolPlan: retained.flatMap((row) => row.record.schoolWeek?.entries ?? []).filter((entry) => eventInWindow(entry, window.today, window.windowEnd)),
    suggestions: current.map((row) => ({
      ...row.payload,
      editedFields: saved.find((entry) => entry.candidateId === row.id)?.editedFields ?? [],
    })),
    brief: live ? [] : db.select().from(briefs).where(eq(briefs.dataset, dataset)).all().flatMap((row) => row.items),
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

export function enqueue(db: OrbitDb, dataset: string, type: "refresh" | "reset" | "delete-live" | "disconnect", now = Date.now()) {
  const data = requireDataset(db, dataset);
  if (type === "reset") requireSynthetic(db, dataset);
  if (["delete-live", "disconnect"].includes(type) && data.kind !== "live") throw new DomainError("This operation requires live mode.");
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
    const data = requireDataset(db, dataset);
    if (action.type === "refresh" || action.type === "reset" || action.type === "delete-live" || action.type === "disconnect") {
      enqueue(db, dataset, action.type);
      if (action.type === "refresh") db.update(datasets).set({ paused: false }).where(eq(datasets.id, dataset)).run();
      return;
    }
    if (action.type === "scenario") {
      requireSynthetic(db, dataset);
      if (db.select().from(jobs).where(and(eq(jobs.dataset, dataset), inArray(jobs.status, ["queued", "running"]))).get()) {
        throw new DomainError("Wait for the current refresh or reset before changing scenarios.", 409);
      }
      db.update(datasets).set({ scenario: action.scenario }).where(eq(datasets.id, dataset)).run();
      enqueue(db, dataset, "refresh");
      return;
    }
    if (data.kind === "live") throw new DomainError("AI suggestions are not enabled in Aula mode.", 403);
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
        dataset, id, candidateId: item.id, revision: item.revision, editedFields, sourceKey: item.sourceKey,
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
