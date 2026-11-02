import type { Extraction, SourceKind, SourceRecord, SyncErrorCode } from "../../domain/model";

export class SourceError extends Error {
  constructor(public readonly code: SyncErrorCode) { super(code); }
}
export interface SourcePage {
  items: SourceRecord[];
  nextCursor: string | null;
  complete: boolean;
  pagesRead?: number;
  issues?: SyncErrorCode[];
  exclusions?: string[];
  removedIds?: string[];
}
export interface SourceAdapter {
  page(kind: SourceKind, cursor: string | null, signal: AbortSignal): Promise<SourcePage>;
  pageTimeout?: number;
}
export interface Summarizer { summarize(record: SourceRecord): Extraction }
export function sourceKey(record: Pick<SourceRecord, "accountScope" | "upstreamId"> & { source: { kind: SourceKind } }) {
  return `${record.accountScope}:${record.source.kind}:${record.upstreamId}`;
}
