import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { initialAgenda } from "../../demo/fixtures";
import { DomainError, REFRESH_INTERVAL, LIVE_RETENTION_MS, candidateSchema, extractionSchema, sourceKinds, sourceRecordSchema, type Coverage, type Extraction, type SourceRecord } from "../../domain/model";
import { liveWindow } from "../../domain/dates";
import { eventInWindow } from "../../domain/presentation";
import type { OrbitDb } from "../db/client";
import { agenda, briefs, candidates, datasets, decisions, jobs, sources, syncRuns, workerLease } from "../db/schema";
import { SourceError, SyntheticSource, SyntheticSummarizer, sourceKey, type SourceAdapter, type SourcePage, type Summarizer } from "../sources/synthetic";
import { latestCoverage, mutate, requireDataset, requireSynthetic } from "./organizer";
import { checkpointPrivateData, pruneLiveData, removeLiveSources } from "./retention";

export function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function assertLease(db: OrbitDb, owner: string) {
  const lease = db.select().from(workerLease).get();
  if (!lease || lease.owner !== owner) throw new DomainError("Worker lease lost.", 409);
}

function validateExtraction(record: SourceRecord, raw: Extraction) {
  const output = extractionSchema.parse(raw);
  for (const item of [...output.candidates, ...output.brief]) {
    if (hash(item.source) !== hash(record.source) || item.child !== record.child) {
      throw new SourceError("invalid-data");
    }
  }
  return output;
}

export function importRecord(db: OrbitDb, dataset: string, raw: SourceRecord, summarize: Summarizer, owner: string) {
  const record = sourceRecordSchema.parse(raw);
  const key = sourceKey(record);
  const revision = hash(record);
  const old = db.select().from(sources).where(and(eq(sources.dataset, dataset), eq(sources.key, key))).get();
  const data = requireDataset(db, dataset);
  const firstSeenAt = old?.firstSeenAt ?? Date.now();
  const expiresAt = data.kind === "live" ? Math.min(firstSeenAt + LIVE_RETENTION_MS, Date.parse(record.retainUntil ?? "")) : null;
  if (data.kind === "live" && (summarize instanceof SyntheticSummarizer || expiresAt === null || !Number.isFinite(expiresAt) || expiresAt <= Date.now() ||
    record.accountScope !== data.accountScope || !data.household?.[record.child])) {
    throw new SourceError("invalid-data");
  }
  // Even cached outputs must respect a simulated processing outage.
  let output: Extraction | null;
  try {
    output = old?.revision === revision && old.extraction && !(summarize instanceof SyntheticSummarizer && data.scenario === "ai-unavailable")
      ? old.extraction : validateExtraction(record, summarize.summarize(record));
    if (data.kind === "live" && (output.candidates.length || output.brief.length)) throw new SourceError("invalid-data");
  } catch (error) {
    if (!(error instanceof SourceError) || error.code !== "summary-unavailable") throw error;
    output = null;
  }
  db.$client.transaction(() => {
    assertLease(db, owner);
    requireDataset(db, dataset);
    db.insert(sources).values({ dataset, key, revision, record, extraction: output, firstSeenAt, expiresAt })
      .onConflictDoUpdate({ target: [sources.dataset, sources.key], set: { revision, record, extraction: output, expiresAt } }).run();
    if (record.structuredEvent) {
      if (record.source.kind !== "Calendar" || record.structuredEvent.origin !== "Structured calendar" || record.structuredEvent.child !== record.child || hash(record.structuredEvent.source) !== hash(record.source)) throw new SourceError("invalid-data");
      const id = `${key}/${record.structuredEvent.id}`;
      const entry = { dataset, id, revision, candidateId: null, sourceKey: key, payload: { ...record.structuredEvent, id }, editedFields: [] };
      db.insert(agenda).values(entry).onConflictDoUpdate({ target: [agenda.dataset, agenda.id], set: entry }).run();
    }
    if (!output) return;
    for (const suggestion of output.candidates) {
      const id = `${key}/${suggestion.id}`;
      const candidateRevision = hash({ generation: data.generation, revision, suggestion });
      const previous = db.select().from(agenda).where(and(eq(agenda.dataset, dataset), eq(agenda.candidateId, id))).get();
      const payload = candidateSchema.parse({
        ...suggestion, id, revision: candidateRevision, sourceKey: key,
        replacesId: previous && previous.revision !== candidateRevision ? previous.id : suggestion.replacesId, editedFields: previous?.editedFields ?? [],
      });
      db.insert(candidates).values({ dataset, id, revision: candidateRevision, payload })
        .onConflictDoUpdate({ target: [candidates.dataset, candidates.id], set: { revision: candidateRevision, payload } }).run();
    }
    const previousBrief = db.select().from(briefs).where(and(eq(briefs.dataset, dataset), eq(briefs.sourceKey, key))).get();
    if (hash(previousBrief?.items ?? []) !== hash(output.brief)) {
      db.insert(briefs).values({ dataset, sourceKey: key, items: output.brief })
        .onConflictDoUpdate({ target: [briefs.dataset, briefs.sourceKey], set: { items: output.brief } }).run();
      db.update(datasets).set({ briefAt: new Date().toISOString() }).where(eq(datasets.id, dataset)).run();
    }
  }).immediate();
  return output !== null;
}

export function seedHistory(db: OrbitDb, dataset: string, owner: string) {
  if (requireSynthetic(db, dataset).initialized) return;
  db.$client.transaction(() => {
    assertLease(db, owner);
    const original = initialAgenda.find((item) => item.id === "lantern")!;
    const record = { accountScope: "synthetic-household", upstreamId: "message-lantern", child: original.child, source: original.source };
    importRecord(db, dataset, record, {
      summarize: () => ({ candidates: [{ ...original, id: "lantern-update", title: "Lantern walk", summary: "Original fictional lantern invitation.", replacesId: "lantern" }], brief: [] }),
    }, owner);
    const candidate = db.select().from(candidates).where(eq(candidates.dataset, dataset)).get()!;
    mutate(db, dataset, { type: "approve", id: candidate.id, revision: candidate.revision, details: original, dateConfirmed: false });
    db.update(datasets).set({ initialized: true }).where(eq(datasets.id, dataset)).run();
  }).immediate();
}

async function fetchPage(adapter: SourceAdapter, kind: typeof sourceKinds[number], cursor: string | null): Promise<SourcePage> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        adapter.page(kind, cursor, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new SourceError("timeout")); }, adapter.pageTimeout ?? 5_000);
        }),
      ]);
    } catch (error) {
      if (!(error instanceof SourceError) || !["unavailable", "timeout"].includes(error.code) || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
    } finally { clearTimeout(timer); }
  }
}

export async function synchronize(db: OrbitDb, dataset: string, owner: string, adapter?: SourceAdapter, summarizer?: Summarizer) {
  assertLease(db, owner);
  const data = requireDataset(db, dataset);
  if (data.kind === "live" && (!adapter || !summarizer)) throw new DomainError("Live sync requires the allowlisted adapter and disabled AI processor.");
  if (data.kind === "live") pruneLiveData(db, dataset);
  const source = adapter ?? new SyntheticSource(data.scenario);
  const processor = summarizer ?? new SyntheticSummarizer(data.scenario);
  const coverage: Coverage[] = latestCoverage(db, dataset).map((item) => ({ ...item, complete: false, error: null, pages: 0, items: 0, checkedAt: null, exclusions: [] }));
  const id = randomUUID();
  db.$client.transaction(() => {
    assertLease(db, owner);
    db.insert(syncRuns).values({ id, dataset, startedAt: new Date().toISOString(), coverage }).run();
  }).immediate();
  let summaryFailed = false;
  const kinds = data.kind === "live" ? ["Calendar", "Post", "Message"] as const : sourceKinds;
  for (const kind of kinds) {
    const outcome = coverage.find((item) => item.kind === kind)!;
    try {
      let cursor: string | null = null;
      const visited = new Set<string>();
      const importedKeys = new Set<string>();
      let issue: Coverage["error"] = null;
      do {
        const page = await fetchPage(source, kind, cursor);
        issue ??= page.issues?.[0] ?? null;
        outcome.exclusions = [...new Set([...(outcome.exclusions ?? []), ...(page.exclusions ?? [])])];
        for (const raw of page.items) {
          const record = sourceRecordSchema.parse(raw);
          if (record.source.kind !== kind) throw new SourceError("invalid-data");
          if (!importRecord(db, dataset, record, processor, owner)) summaryFailed = true;
          importedKeys.add(sourceKey(record));
        }
        const removedIds = page.removedIds ?? [];
        const accountScope = data.accountScope;
        if (data.kind === "live" && removedIds.length) {
          if (!accountScope) throw new SourceError("invalid-data");
          db.$client.transaction(() => {
            assertLease(db, owner);
            removeLiveSources(db, dataset, removedIds.map((upstreamId) => sourceKey({
              accountScope, upstreamId, source: { kind },
            })));
          }).immediate();
        }
        outcome.pages += page.pagesRead ?? 1;
        outcome.items += page.items.length;
        cursor = page.nextCursor;
        if (cursor && (visited.has(cursor) || outcome.pages >= 1000)) throw new SourceError("incomplete");
        if (cursor) visited.add(cursor);
        if (!cursor && !page.complete) throw new SourceError("incomplete");
      } while (cursor);
      outcome.complete = issue === null;
      outcome.error = issue;
      outcome.checkedAt = new Date().toISOString();
      if (outcome.complete) {
        outcome.lastSuccess = outcome.checkedAt;
        if (data.kind === "live" && kind === "Calendar") {
          const window = liveWindow();
          const removed = db.select().from(sources).where(eq(sources.dataset, dataset)).all().filter((row) =>
            row.record.structuredEvent && eventInWindow(row.record.structuredEvent, window.today, window.windowEnd) && !importedKeys.has(row.key));
          db.$client.transaction(() => {
            assertLease(db, owner);
            removeLiveSources(db, dataset, removed.map((row) => row.key));
          }).immediate();
        }
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (!(error instanceof SourceError) && !(error instanceof Error && error.name === "ZodError")) throw error;
      outcome.error = error instanceof SourceError ? error.code : "invalid-data";
      outcome.checkedAt = new Date().toISOString();
    }
    db.$client.transaction(() => {
      assertLease(db, owner);
      db.update(syncRuns).set({ coverage }).where(eq(syncRuns.id, id)).run();
    }).immediate();
    if (data.kind === "live") checkpointPrivateData(db);
  }
  db.$client.transaction(() => {
    assertLease(db, owner);
    const complete = coverage.every((item) => item.complete);
    const finishedAt = new Date().toISOString();
    db.update(syncRuns).set({ coverage, finishedAt, error: summaryFailed ? "summary-unavailable" : complete ? null : "Source checks incomplete; previous data retained." }).where(eq(syncRuns.id, id)).run();
    db.update(datasets).set({ nextRefresh: Date.now() + REFRESH_INTERVAL, ...(complete ? { lastSuccess: finishedAt } : {}) }).where(eq(datasets.id, dataset)).run();
  }).immediate();
}

export function resetSynthetic(db: OrbitDb, dataset: string, owner: string) {
  db.$client.transaction(() => {
    assertLease(db, owner);
    requireSynthetic(db, dataset);
    for (const table of [sources, candidates, decisions, agenda, briefs, syncRuns]) {
      db.delete(table).where(eq(table.dataset, dataset)).run();
    }
    db.delete(jobs).where(and(eq(jobs.dataset, dataset), eq(jobs.status, "done"))).run();
    db.update(datasets).set({ generation: randomUUID(), initialized: false, scenario: "normal", lastSuccess: null, briefAt: null, nextRefresh: 0 }).where(eq(datasets.id, dataset)).run();
    seedHistory(db, dataset, owner);
  }).immediate();
}

export function recoverInterrupted(db: OrbitDb) {
  db.update(jobs).set({ status: "queued", error: null }).where(eq(jobs.status, "running")).run();
  db.update(syncRuns).set({ finishedAt: new Date().toISOString(), error: "interrupted" }).where(isNull(syncRuns.finishedAt)).run();
}
