// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { eq } from "drizzle-orm";
import { migrateDatabase, openDatabase, type OrbitDb } from "@/server/db/client";
import { agenda, candidates, datasets, decisions, jobs, sources, syncRuns, workerLease } from "@/server/db/schema";
import { enqueue, ensureDataset, getSnapshot, mutate } from "@/server/services/organizer";
import { importRecord, resetSynthetic, seedHistory, synchronize } from "@/server/services/sync";
import { SourceError, SyntheticSource, SyntheticSummarizer, syntheticRecords, type SourceAdapter, type Summarizer } from "@/server/sources/synthetic";
import { acquireLease, processNextJob, releaseLease, renewLease, requestScheduledRefresh } from "@/worker/runner";
import { REFRESH_INTERVAL, type Candidate } from "@/domain/model";
import { suggestionDetails } from "@/domain/presentation";

const dataset = "synthetic-test";
const owner = "test-worker";
let db: OrbitDb;
let directory: string;
let path: string;
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "orbit-test-"));
  path = join(directory, "test.sqlite");
  db = openDatabase(path);
  migrateDatabase(db);
  ensureDataset(db, dataset);
  expect(acquireLease(db, owner)).toBe(true);
  seedHistory(db, dataset, owner);
  await synchronize(db, dataset, owner);
});
afterEach(() => {
  vi.useRealTimers();
  db.$client.close();
  rmSync(directory, { recursive: true, force: true });
});
function snapshot() { return getSnapshot(db, dataset); }
function candidate(title: string): Candidate {
  const item = snapshot().suggestions.find((entry) => entry.title === title);
  if (!item) throw new Error(`Missing candidate: ${title}`);
  return item;
}
function approve(item: Candidate, edits = {}) {
  return mutate(db, dataset, { type: "approve", id: item.id, revision: item.revision, details: { ...suggestionDetails(item, snapshot().agenda), ...edits }, dateConfirmed: false });
}
function counts() {
  return [sources, candidates, agenda, decisions].map((table) => db.select().from(table).all().length);
}

describe("persistent organizer", () => {
  it("migrates safely and repeated imports preserve decisions, edits and row counts across restart", async () => {
    approve(candidate("Visit to the nature centre"), { title: "Packed lunch", location: "Our meeting point" });
    const dismissed = candidate("Autumn gathering");
    mutate(db, dataset, { type: "dismiss", id: dismissed.id, revision: dismissed.revision });
    const before = snapshot();
    const totals = counts();
    await synchronize(db, dataset, owner);
    await synchronize(db, dataset, owner);
    expect(counts()).toEqual(totals);
    releaseLease(db, owner);
    db.$client.close();
    db = openDatabase(path);
    migrateDatabase(db);
    expect(acquireLease(db, "restarted-worker")).toBe(true);
    await synchronize(db, dataset, "restarted-worker");
    expect(snapshot().agenda).toEqual(before.agenda);
    expect(snapshot().decisions).toEqual(before.decisions);
    expect(snapshot().briefAt).toEqual(before.briefAt);
    expect(snapshot().agenda.find((entry) => entry.title === "Packed lunch")?.time).toBe("");
  });
  it("preserves all user-edited fields through changed sources, and rejects stale approvals", () => {
    const original = candidate("Visit to the nature centre");
    approve(original, { title: "Our trip", location: "Our gate", time: "09:10" });
    const record = syntheticRecords().find((item) => item.source.id === original.source.id)!;
    const changed = { ...record, source: { ...record.source, id: "post-trip-v2", excerpt: `${record.source.excerpt} Turen er flyttet til 5. november.` } };
    const summarizer: Summarizer = { summarize: () => ({ candidates: [{ ...original, source: changed.source, id: "trip", date: "2026-11-05", time: "09:00", location: "New source location" }], brief: [] }) };
    importRecord(db, dataset, changed, summarizer, owner);
    const revision = candidate("Visit to the nature centre");
    expect(revision.revision).not.toBe(original.revision);
    expect(snapshot().decisions[revision.id]).toBeUndefined();
    expect(snapshot().agenda.find((entry) => entry.title === "Our trip")?.date).toBe("2026-11-04");
    expect(() => approve(original)).toThrow("changed");
    expect(suggestionDetails(revision, snapshot().agenda)).toEqual({ title: "Our trip", location: "Our gate", time: "09:10", date: "2026-11-05" });
    approve(revision);
    expect(snapshot().agenda.filter((entry) => entry.title === "Our trip")).toHaveLength(1);
    expect(snapshot().agenda.find((entry) => entry.title === "Our trip")?.date).toBe("2026-11-05");
  });
  it("revises the seeded lantern entry without duplicates or losing its edited title", () => {
    approve(candidate("Lantern walk"));
    expect(snapshot().agenda).toHaveLength(4);
    expect(snapshot().agenda.find((entry) => entry.id === "lantern")).toMatchObject({ title: "Lantern walk + raincoats", date: "2026-11-13", time: "16:30" });
  });
  it("requires a real date and explicit confirmation for unresolved sources", () => {
    const item = candidate("Autumn gathering");
    expect(() => approve(item)).toThrow();
    expect(() => approve(item, { date: "2026-11-20" })).toThrow("Confirm");
    mutate(db, dataset, { type: "approve", id: item.id, revision: item.revision, details: { ...suggestionDetails(item, []), date: "2026-11-20" }, dateConfirmed: true });
    expect(snapshot().agenda.find((entry) => entry.title === item.title)?.time).toBe("");
  });
  it("resets only the selected synthetic dataset, and invalidates pre-reset review forms", async () => {
    ensureDataset(db, "synthetic-other");
    seedHistory(db, "synthetic-other", owner);
    await synchronize(db, "synthetic-other", owner);
    const other = getSnapshot(db, "synthetic-other");
    db.insert(datasets).values({ id: "live-sentinel", kind: "live" }).run();
    db.insert(agenda).values({ dataset: "live-sentinel", id: "untouched", revision: "v1", editedFields: [], payload: snapshot().agenda[0] }).run();
    const stale = candidate("Visit to the nature centre");
    approve(stale);
    resetSynthetic(db, dataset, owner);
    await synchronize(db, dataset, owner);
    expect(snapshot().agenda).toHaveLength(4);
    expect(snapshot().decisions[stale.id]).toBeUndefined();
    expect(() => approve(stale)).toThrow("changed");
    expect(getSnapshot(db, "synthetic-other")).toEqual(other);
    expect(db.select().from(agenda).where(eq(agenda.dataset, "live-sentinel")).all()).toHaveLength(1);
    expect(() => resetSynthetic(db, "live-sentinel", owner)).toThrow("disabled");
  });
  it("blocks reviews during a queued reset and completes the reset through the worker", async () => {
    const item = candidate("Visit to the nature centre");
    mutate(db, dataset, { type: "reset" });
    expect(() => approve(item)).toThrow("reset is pending");
    await processNextJob(db, dataset, owner);
    expect(snapshot().job).toBeNull();
    expect(snapshot().agenda).toHaveLength(4);
    expect(snapshot().suggestions).toHaveLength(4);
  });
  it("does not merge unrelated events with identical titles", () => {
    const item = candidate("Trip permission deadline");
    const record = syntheticRecords().find((entry) => entry.source.id === item.source.id)!;
    const other = { ...record, upstreamId: "unrelated" };
    importRecord(db, dataset, other, new SyntheticSummarizer("normal"), owner);
    expect(snapshot().suggestions.filter((entry) => entry.title === item.title)).toHaveLength(2);
  });
});

describe("sync failures and recovery", () => {
  it("preserves last successful data on partial, empty and failed refreshes", async () => {
    approve(candidate("Visit to the nature centre"));
    const before = snapshot();
    await synchronize(db, dataset, owner, new SyntheticSource("partial"));
    expect(snapshot().coverage.find((item) => item.kind === "Message")).toMatchObject({ complete: false, error: "incomplete", pages: 1 });
    expect(snapshot().lastSuccess).toBe(before.lastSuccess);
    expect(snapshot().agenda).toEqual(before.agenda);
    await synchronize(db, dataset, owner, new SyntheticSource("error"));
    expect(snapshot().coverage.every((item) => item.error === "unavailable")).toBe(true);
    expect(snapshot().lastSuccess).toBe(before.lastSuccess);
    await synchronize(db, dataset, owner, new SyntheticSource("empty"));
    expect(snapshot().coverage.every((item) => item.complete && item.items === 0)).toBe(true);
    expect(snapshot().agenda).toEqual(before.agenda);
    expect(snapshot().suggestions).toEqual(before.suggestions);
  });
  it("keeps the previous brief during a processing outage while importing structured facts", async () => {
    const before = snapshot();
    db.update(datasets).set({ scenario: "ai-unavailable" }).where(eq(datasets.id, dataset)).run();
    await synchronize(db, dataset, owner);
    expect(snapshot().syncError).toBe("summary-unavailable");
    expect(snapshot().briefAt).toBe(before.briefAt);
    expect(snapshot().brief).toEqual(before.brief);
    expect(snapshot().agenda).toEqual(before.agenda);
  });
  it("rejects processing output with wrong source evidence", () => {
    const record = syntheticRecords()[0];
    const item = candidate("Visit to the nature centre");
    expect(() => importRecord(db, dataset, { ...record, upstreamId: "new" }, { summarize: () => ({ candidates: [item], brief: [] }) }, owner)).toThrow("invalid-data");
  });
  it("imports every page, detects cursor loops, and records schema errors", async () => {
    const source: SourceAdapter = {
      page: async (kind, cursor) => {
        const page = Number(cursor ?? 0);
        const original = syntheticRecords().find((record) => record.source.kind === kind)!;
        return { items: [{ ...original, upstreamId: `${kind}-${page}` }], nextCursor: page < 24 ? String(page + 1) : null, complete: page === 24 };
      },
    };
    await synchronize(db, dataset, owner, source);
    expect(snapshot().coverage.every((item) => item.pages === 25 && item.complete)).toBe(true);
    await synchronize(db, dataset, owner, { page: async () => ({ items: [], nextCursor: "loop", complete: false }) });
    expect(snapshot().coverage.every((item) => item.error === "incomplete")).toBe(true);
    await synchronize(db, dataset, owner, { page: async () => ({ items: [{ ...syntheticRecords()[0], upstreamId: "" }], nextCursor: null, complete: true }) });
    expect(snapshot().coverage.every((item) => item.error === "invalid-data")).toBe(true);
  });
  it("bounds timeouts and retry attempts", async () => {
    vi.useFakeTimers();
    const page = vi.fn(() => new Promise<never>(() => {}));
    const promise = synchronize(db, dataset, owner, { page });
    await vi.advanceTimersByTimeAsync(46_000);
    await promise;
    expect(page).toHaveBeenCalledTimes(9);
    expect(snapshot().coverage.every((item) => item.error === "timeout")).toBe(true);
  });
  it("queues manual and 30-minute scheduled refreshes through one leased workflow", async () => {
    expect(acquireLease(db, "second-worker")).toBe(false);
    const before = snapshot();
    const first = mutate(db, dataset, { type: "refresh" });
    expect(first.job).toBe("queued");
    mutate(db, dataset, { type: "refresh" });
    expect(db.select().from(jobs).all()).toHaveLength(1);
    await processNextJob(db, dataset, owner);
    expect(snapshot().job).toBeNull();
    expect(snapshot().agenda).toEqual(before.agenda);
    const next = db.select().from(datasets).where(eq(datasets.id, dataset)).get()!.nextRefresh;
    expect(next - Date.now()).toBeGreaterThan(REFRESH_INTERVAL - 1000);
    requestScheduledRefresh(db, dataset, owner, next - 1);
    expect(snapshot().job).toBeNull();
    requestScheduledRefresh(db, dataset, owner, next);
    expect(snapshot().job).toBe("queued");
  });
  it("recovers interrupted jobs after lease expiry and fences the old worker", async () => {
    const id = enqueue(db, dataset, "refresh");
    db.update(jobs).set({ status: "running" }).where(eq(jobs.id, id)).run();
    db.insert(syncRuns).values({ id: "interrupted", dataset, startedAt: new Date().toISOString(), coverage: [] }).run();
    db.update(workerLease).set({ expiresAt: 0 }).run();
    expect(acquireLease(db, "replacement")).toBe(true);
    expect(() => renewLease(db, owner)).toThrow("lease lost");
    expect(db.select().from(jobs).where(eq(jobs.id, id)).get()?.status).toBe("queued");
    expect(db.select().from(syncRuns).where(eq(syncRuns.id, "interrupted")).get()?.error).toBe("interrupted");
    await expect(synchronize(db, dataset, owner)).rejects.toThrow("lease lost");
    await processNextJob(db, dataset, "replacement");
    expect(snapshot().job).toBeNull();
    expect(counts().slice(0, 3)).toEqual([7, 4, 4]);
  });
  it("renews after sleep when no replacement worker acquired the expired lease", () => {
    db.update(workerLease).set({ expiresAt: 0 }).run();
    expect(snapshot().workerOnline).toBe(false);
    renewLease(db, owner);
    expect(snapshot().workerOnline).toBe(true);
  });
  it.each(["disconnected", "reconnect"] as const)("records typed %s failures", async (scenario) => {
    await synchronize(db, dataset, owner, { page: async () => { throw new SourceError(scenario); } });
    expect(snapshot().coverage.every((item) => item.error === scenario && !item.complete)).toBe(true);
  });
});
