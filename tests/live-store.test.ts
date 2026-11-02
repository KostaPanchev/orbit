// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LIVE_RETENTION_MS, type SourceRecord } from "@/domain/model";
import { migrateDatabase, openDatabase, type OrbitDb } from "@/server/db/client";
import { agenda, datasets, jobs, sources } from "@/server/db/schema";
import { ensureDataset, getSnapshot, mutate } from "@/server/services/organizer";
import { importRecord, synchronize } from "@/server/services/sync";
import { deleteLiveData, pruneLiveData } from "@/server/services/retention";
import { normalizeEvent } from "@/server/aula/normalize";
import { normalizeSchoolWeek } from "@/server/aula/school-plan";
import { SourceError, type SourceAdapter, type Summarizer } from "@/server/sources/types";
import { acquireLease, requestScheduledRefresh } from "@/worker/runner";
import { fictionalEvent, fictionalSchoolWeek, liveProfile, liveRecords, LIVE_NOW } from "./live-fixtures";

const dataset = "live-aula";
const owner = "fictional-live-worker";
const noAI: Summarizer = { summarize: () => ({ candidates: [], brief: [] }) };
let directory: string;
let path: string;
let db: OrbitDb;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(LIVE_NOW);
  directory = mkdtempSync(join(tmpdir(), "orbit-live-store-"));
  path = join(directory, "fixture.sqlite");
  db = openDatabase(path);
  migrateDatabase(db);
  ensureDataset(db, dataset);
  db.update(datasets).set({ accountScope: liveProfile.accountScope, household: liveProfile.household, householdAt: LIVE_NOW }).where(eq(datasets.id, dataset)).run();
  expect(acquireLease(db, owner)).toBe(true);
});
afterEach(() => {
  db.$client.close();
  rmSync(directory, { recursive: true, force: true });
  vi.useRealTimers();
});
function adapter(records: SourceRecord[], calendarComplete = true): SourceAdapter {
  return { page: async (kind) => ({ items: records.filter((record) => record.source.kind === kind), nextCursor: null, complete: kind !== "Calendar" || calendarComplete }) };
}
const snapshot = () => getSnapshot(db, dataset, Date.now(), false);

it("persists separate live previews/calendar facts without fictional briefs or suggestions", async () => {
  await synchronize(db, dataset, owner, adapter(liveRecords()), noAI);
  const first = snapshot();
  expect(first).toMatchObject({ mode: "live", suggestions: [], brief: [], briefAt: null, today: "2026-11-02", windowEnd: "2026-12-02" });
  expect(first.previews).toHaveLength(2);
  expect(first.agenda).toHaveLength(1);
  expect(first.household["aula-10"].name).toBe("Fictional pupil");
  expect(JSON.stringify(first)).not.toContain("Emma");
  await synchronize(db, dataset, owner, adapter(liveRecords()), noAI);
  expect(snapshot().agenda).toEqual(first.agenda);
  expect(db.select().from(sources).all()).toHaveLength(3);
  db.$client.close();
  db = openDatabase(path);
  expect(snapshot().previews).toEqual(first.previews);
});

it("replaces whole school weeks atomically, retains failed weeks, and keeps Overview unchanged", async () => {
  const raw = fictionalSchoolWeek();
  const week = normalizeSchoolWeek(raw, liveProfile, 10, "2026-11-02");
  await synchronize(db, dataset, owner, adapter([...liveRecords(), week]), noAI);
  expect(snapshot().schoolPlan).toHaveLength(1);
  expect(snapshot().agenda).toHaveLength(1);
  expect(snapshot().previews).toHaveLength(2);
  expect(snapshot().schoolPlan[0].notes).toContain("Læs kapitel 2.");
  raw.events[0].html = "<p>Changed fictional assignment.</p>";
  await synchronize(db, dataset, owner, adapter([...liveRecords(), normalizeSchoolWeek(raw, liveProfile, 10, "2026-11-02")]), noAI);
  expect(snapshot().schoolPlan).toHaveLength(1);
  expect(snapshot().schoolPlan[0].notes).toContain("Changed fictional assignment.");
  await synchronize(db, dataset, owner, {
    page: async (kind) => kind === "Weekly plan"
      ? { items: [], complete: true, nextCursor: null, issues: ["unavailable"] }
      : adapter(liveRecords()).page(kind, null, new AbortController().signal),
  }, noAI);
  expect(snapshot().schoolPlan).toHaveLength(1);
  expect(snapshot().coverage.find((item) => item.kind === "Weekly plan")?.complete).toBe(false);
  await synchronize(db, dataset, owner, adapter([...liveRecords(), normalizeSchoolWeek({ ...raw, events: [] }, liveProfile, 10, "2026-11-02")]), noAI);
  expect(snapshot().schoolPlan).toEqual([]);
  expect(snapshot().agenda).toHaveLength(1);
});

it("expires and deletes weekly lesson text and links with their source record", () => {
  importRecord(db, dataset, normalizeSchoolWeek(fictionalSchoolWeek(), liveProfile, 10, "2026-11-02"), noAI, owner);
  const expiresAt = db.select().from(sources).get()!.expiresAt!;
  vi.setSystemTime(expiresAt);
  expect(snapshot().schoolPlan).toEqual([]);
  pruneLiveData(db, dataset);
  expect(db.select().from(sources).all()).toEqual([]);
});

it("does not extend retention when the same source is reimported", () => {
  const record = liveRecords()[0];
  importRecord(db, dataset, record, noAI, owner);
  const first = db.select().from(sources).get()!;
  vi.setSystemTime(LIVE_NOW + 40 * 86400_000);
  importRecord(db, dataset, record, noAI, owner);
  const again = db.select().from(sources).get()!;
  expect(again.firstSeenAt).toBe(first.firstSeenAt);
  expect(again.expiresAt).toBe(first.expiresAt);
  expect(again.expiresAt! - LIVE_NOW).toBeLessThanOrEqual(LIVE_RETENTION_MS);
});

it("hides expired records at the exact boundary, purges them, and prevents old-source reimport", () => {
  const marker = "FICTIONAL_RETENTION_SENTINEL_c73a";
  const record = liveRecords()[0];
  record.source.excerpt = marker;
  importRecord(db, dataset, record, noAI, owner);
  const expiresAt = db.select().from(sources).get()!.expiresAt!;
  vi.setSystemTime(expiresAt - 1);
  expect(snapshot().previews).toHaveLength(1);
  vi.setSystemTime(expiresAt);
  expect(snapshot().previews).toEqual([]);
  pruneLiveData(db, dataset);
  expect(db.select().from(sources).all()).toEqual([]);
  expect(readFileSync(path).includes(marker)).toBe(false);
  expect(() => importRecord(db, dataset, record, noAI, owner)).toThrow(SourceError);
});

it("caps future calendar records at 90 days since first persistence", () => {
  const event = normalizeEvent({ ...fictionalEvent, startDateTime: "2026-11-20T08:00:00+01:00", endDateTime: "2026-11-20T09:00:00+01:00" }, liveProfile, LIVE_NOW)!;
  importRecord(db, dataset, event, noAI, owner);
  expect(db.select().from(sources).get()?.expiresAt).toBe(LIVE_NOW + LIVE_RETENTION_MS);
  vi.setSystemTime(LIVE_NOW + LIVE_RETENTION_MS);
  expect(snapshot().agenda).toEqual([]);
  pruneLiveData(db, dataset);
  expect(db.select().from(agenda).all()).toEqual([]);
  expect(db.select().from(datasets).where(eq(datasets.id, dataset)).get()?.accountScope).toBeNull();
});

it("rejects account/audience mixing and any attempt to insert AI/demo output into live data", () => {
  const record = liveRecords()[0];
  expect(() => importRecord(db, dataset, { ...record, accountScope: "another-account" }, noAI, owner)).toThrow();
  expect(() => importRecord(db, dataset, { ...record, child: "emma" }, noAI, owner)).toThrow();
  expect(() => importRecord(db, dataset, record, {
    summarize: () => ({ candidates: [], brief: [{ id: "fake", child: record.child, source: record.source, title: "Not allowed", summary: "Not allowed", label: "AI" }] }),
  }, owner)).toThrow();
  expect(db.select().from(sources).all()).toEqual([]);
});

it("keeps calendar entries on a partial response and reconciles only complete relevant snapshots", async () => {
  const first = normalizeEvent(fictionalEvent, liveProfile, LIVE_NOW)!;
  const second = normalizeEvent({ ...fictionalEvent, id: 301, title: "Unrelated event with a distinct ID" }, liveProfile, LIVE_NOW)!;
  await synchronize(db, dataset, owner, adapter([first, second]), noAI);
  await synchronize(db, dataset, owner, adapter([first], false), noAI);
  expect(snapshot().agenda).toHaveLength(2);
  const moved = normalizeEvent({ ...fictionalEvent, title: "Changed calendar facts", startDateTime: "2026-11-04T08:00:00+01:00", endDateTime: "2026-11-04T09:00:00+01:00" }, liveProfile, LIVE_NOW)!;
  await synchronize(db, dataset, owner, adapter([moved]), noAI);
  expect(snapshot().agenda).toHaveLength(1);
  expect(snapshot().agenda[0]).toMatchObject({ title: "Changed calendar facts", date: "2026-11-04" });
  await synchronize(db, dataset, owner, adapter([]), noAI);
  expect(snapshot().agenda).toEqual([]);
});

it("does not reconcile calendar deletions when a page reports normalization gaps", async () => {
  const event = normalizeEvent(fictionalEvent, liveProfile, LIVE_NOW)!;
  await synchronize(db, dataset, owner, adapter([event]), noAI);
  await synchronize(db, dataset, owner, { page: async () => ({
    items: [], nextCursor: null, complete: true, issues: ["invalid-data"], exclusions: ["Some records could not be normalized"],
  }) }, noAI);
  expect(snapshot().agenda).toHaveLength(1);
  expect(snapshot().coverage.every((item) => !item.complete)).toBe(true);
});

it("deletes only live data, pauses automatic refresh, and rejects synthetic reset controls", async () => {
  await synchronize(db, dataset, owner, adapter(liveRecords()), noAI);
  ensureDataset(db, "synthetic-sentinel");
  db.insert(agenda).values({
    dataset: "synthetic-sentinel", id: "sentinel", revision: "v1", editedFields: [], payload: snapshot().agenda[0],
  }).run();
  expect(() => mutate(db, dataset, { type: "reset" })).toThrow("disabled");
  expect(() => mutate(db, dataset, { type: "scenario", scenario: "busy" })).toThrow("disabled");
  deleteLiveData(db, dataset);
  expect(snapshot()).toMatchObject({ previews: [], agenda: [], household: {}, paused: true });
  expect(db.select().from(agenda).where(eq(agenda.dataset, "synthetic-sentinel")).all()).toHaveLength(1);
  requestScheduledRefresh(db, dataset, owner);
  expect(db.select().from(jobs).where(eq(jobs.dataset, dataset)).all()).toHaveLength(0);
  mutate(db, dataset, { type: "refresh" });
  expect(snapshot().paused).toBe(false);
  expect(db.select().from(jobs).where(eq(jobs.dataset, dataset)).all()).toHaveLength(1);
});
