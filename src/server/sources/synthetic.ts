import { setTimeout as delay } from "node:timers/promises";
import { brief, initialAgenda, suggestions } from "../../demo/fixtures";
import type { Extraction, Scenario, SourceKind, SourceRecord, SyncErrorCode } from "../../domain/model";

export class SourceError extends Error {
  constructor(public readonly code: SyncErrorCode) { super(code); }
}
export interface SourcePage { items: SourceRecord[]; nextCursor: string | null; complete: boolean }
export interface SourceAdapter {
  page(kind: SourceKind, cursor: string | null, signal: AbortSignal): Promise<SourcePage>;
}
export interface Summarizer {
  summarize(record: SourceRecord): Extraction;
}
export function sourceKey(record: SourceRecord) {
  return `${record.accountScope}:${record.source.kind}:${record.upstreamId}`;
}
export function syntheticRecords(includeBusy = false): SourceRecord[] {
  const items = [...initialAgenda.filter((item) => item.origin === "Structured calendar"), ...suggestions.filter((item) => !item.busyOnly || includeBusy), ...brief.filter((item) => !item.busyOnly || includeBusy)];
  return [...new Map(items.map((item) => [item.source.id, {
    accountScope: "synthetic-household", upstreamId: item.source.id.replace(/-v\d+$/, ""),
    child: item.child, source: item.source,
    structuredEvent: "origin" in item ? item : undefined,
  }])).values()];
}
export class SyntheticSource implements SourceAdapter {
  constructor(private readonly scenario: Scenario) {}
  async page(kind: SourceKind, cursor: string | null, signal: AbortSignal): Promise<SourcePage> {
    signal.throwIfAborted();
    if (this.scenario === "loading") await delay(500, undefined, { signal });
    if (this.scenario === "error" || this.scenario === "stale") throw new SourceError("unavailable");
    if (this.scenario === "disconnected") throw new SourceError("disconnected");
    if (this.scenario === "reconnect") throw new SourceError("reconnect");
    if (this.scenario === "partial" && kind === "Message" && cursor) throw new SourceError("incomplete");
    const records = this.scenario === "empty" ? [] : syntheticRecords(this.scenario === "busy").filter((item) => item.source.kind === kind);
    const offset = Number(cursor ?? 0);
    const pageSize = this.scenario === "partial" && kind === "Message" ? 1 : 2;
    const items = records.slice(offset, offset + pageSize);
    const nextCursor = offset + pageSize < records.length ? String(offset + pageSize) : null;
    return { items, nextCursor, complete: nextCursor === null };
  }
}
export class SyntheticSummarizer implements Summarizer {
  constructor(private readonly scenario: Scenario) {}
  summarize(record: SourceRecord): Extraction {
    if (this.scenario === "ai-unavailable") throw new SourceError("summary-unavailable");
    return {
      candidates: suggestions.filter((item) => item.source.id === record.source.id),
      brief: brief.filter((item) => item.source.id === record.source.id),
    };
  }
}
