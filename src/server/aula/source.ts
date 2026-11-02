import { z } from "zod";
import { liveWindow, normalizeTimestamp } from "../../domain/dates";
import { eventInWindow } from "../../domain/presentation";
import { LIVE_RETENTION_MS, type SourceKind, type SourceRecord } from "../../domain/model";
import { SourceError, type SourceAdapter, type SourcePage } from "../sources/types";
import { AulaReadError, type AulaReader, type AulaReadTool } from "./read-client";
import { SchoolPlanSource } from "./school-plan";
import {
  cancellationSchema, messagePageSchema, normalizeEvent, normalizePost, normalizeThread, normalizeThreadPreview,
  threadPageSchema, type LiveMessage, type LiveProfile,
} from "./normalize";

const postPage = z.object({ posts: z.array(z.unknown()), count: z.number().int().nonnegative(), moreMessagesExist: z.boolean() });
export class AulaSource implements SourceAdapter {
  readonly pageTimeout = 60_000;
  private calls = 0;
  private cache: z.infer<typeof threadPageSchema> | undefined;
  private readonly threadsSeen = new Set<number>();
  private readonly postsSeen = new Set<string>();
  private readonly schoolPlans: SchoolPlanSource;
  constructor(private readonly reader: AulaReader, readonly profile: LiveProfile, private readonly now = Date.now(), private readonly stop?: AbortSignal) {
    const window = liveWindow(new Date(now));
    this.schoolPlans = new SchoolPlanSource(reader, profile, window.today, window.windowEnd);
  }
  private async read(tool: AulaReadTool, args: Record<string, unknown>, signal: AbortSignal) {
    this.calls++;
    try { return await this.reader.read(tool, args, signal); }
    catch (error) {
      if (!(error instanceof AulaReadError)) throw error;
      throw new SourceError(error.code === "timeout" ? "timeout" : error.code === "reconnect" ? "reconnect" :
        error.code === "rate-limited" ? "rate-limited" :
        ["incomplete", "sensitive", "limit", "response-shape"].includes(error.code) ? "incomplete" : "unavailable");
    }
  }
  async page(kind: SourceKind, cursor: string | null, signal: AbortSignal): Promise<SourcePage> {
    this.calls = 0;
    if (this.stop?.aborted) throw new SourceError("interrupted");
    try {
      const result = kind === "Weekly plan" ? await this.schoolPlans.page(cursor, signal) : kind === "Post" ? await this.posts(cursor, signal) : kind === "Calendar" ? await this.calendar(cursor, signal) : await this.messages(cursor, signal);
      return { ...result, pagesRead: result.pagesRead ?? this.calls };
    } catch (error) {
      if (error instanceof z.ZodError) throw new SourceError("invalid-data");
      throw error;
    }
  }
  private capture(raw: unknown[], normalize: (value: unknown) => SourceRecord | null) {
    const items: SourceRecord[] = [];
    let invalid = false;
    for (const value of raw) {
      try { const record = normalize(value); if (record) items.push(record); }
      catch (error) {
        if (!(error instanceof z.ZodError) && !(error instanceof SourceError)) throw error;
        invalid = true;
      }
    }
    return { items, issues: invalid ? ["invalid-data" as const] : [], exclusions: invalid ? ["Some records could not be normalized"] : [] };
  }
  private async posts(cursor: string | null, signal: AbortSignal): Promise<SourcePage> {
    const index = cursor === null ? 0 : z.coerce.number().int().nonnegative().parse(cursor);
    if (index >= 2500) throw new SourceError("incomplete");
    const data = postPage.parse(await this.read("aula.posts.list", { index, limit: 50, onlyUnread: false }, signal));
    if (data.count !== data.posts.length || !data.posts.length && data.moreMessagesExist) throw new SourceError("incomplete");
    const normalized = this.capture(data.posts, (raw) => normalizePost(raw, this.profile, this.now));
    for (const record of normalized.items) {
      if (this.postsSeen.has(record.upstreamId)) throw new SourceError("incomplete");
    }
    for (const record of normalized.items) this.postsSeen.add(record.upstreamId);
    return { ...normalized, nextCursor: data.moreMessagesExist ? String(index + data.posts.length) : null, complete: !data.moreMessagesExist };
  }
  private async calendar(cursor: string | null, signal: AbortSignal): Promise<SourcePage> {
    if (cursor !== null) throw new SourceError("invalid-data");
    const { start, end, today, windowEnd } = liveWindow(new Date(this.now));
    const data = z.array(z.unknown()).parse(await this.read("aula.calendar.events", { profileIds: this.profile.profileIds, start, end }, signal));
    const removedIds: string[] = [];
    const seen = new Set<string>();
    for (const raw of data) {
      const identity = z.object({ id: z.number().int().positive() }).safeParse(raw);
      if (identity.success) {
        const key = String(identity.data.id);
        if (seen.has(key)) throw new SourceError("incomplete");
        seen.add(key);
      }
    }
    const normalized = this.capture(data, (raw) => {
      const cancellation = cancellationSchema.parse(raw);
      const id = String(cancellation.id);
      if (cancellation.cancelled || cancellation.isCancelled || ["cancelled", "canceled"].includes(cancellation.status?.toLowerCase() ?? "")) {
        removedIds.push(id);
        return null;
      }
      const record = normalizeEvent(raw, this.profile, this.now);
      return record?.structuredEvent && eventInWindow(record.structuredEvent, today, windowEnd) ? record : null;
    });
    return { ...normalized, removedIds, nextCursor: null, complete: true };
  }
  private async messages(cursor: string | null, signal: AbortSignal): Promise<SourcePage> {
    const match = /^(\d+)\/(\d+)$/.exec(cursor ?? "0/0");
    if (!match) throw new SourceError("invalid-data");
    const page = Number(match[1]);
    const offset = Number(match[2]);
    if (page >= 50) throw new SourceError("incomplete");
    if (!this.cache || this.cache.page !== page) {
      const data = threadPageSchema.parse(await this.read("aula.messages.list_threads", { page }, signal));
      if (data.page !== page || !data.threads.length && data.hasMorePages) throw new SourceError("incomplete");
      for (const thread of data.threads) {
        if (this.threadsSeen.has(thread.id)) throw new SourceError("incomplete");
      }
      for (const thread of data.threads) this.threadsSeen.add(thread.id);
      this.cache = data;
    }
    const data = this.cache;
    const nextCursor = offset + 1 < data.threads.length ? `${page}/${offset + 1}` : data.hasMorePages ? `${page + 1}/0` : null;
    const base = { nextCursor, complete: nextCursor === null };
    const thread = data.threads[offset];
    if (!thread) {
      if (offset === 0 && !data.threads.length) return { ...base, items: [] };
      throw new SourceError("invalid-data");
    }
    const expired = Date.parse(normalizeTimestamp(thread.latestMessage.sendDateTime)) + LIVE_RETENTION_MS <= this.now;
    if (expired || thread.sensitive) return {
      ...base, items: [], removedIds: [String(thread.id)],
      ...(thread.sensitive ? { exclusions: ["Sensitive messages not fetched"], issues: ["incomplete" as const] } : {}),
    };
    if (!thread.read || thread.sensitive === undefined) {
      const preview = normalizeThreadPreview(thread, this.profile, this.now);
      return { ...base, items: preview ? [preview] : [], issues: ["incomplete"], exclusions: ["Unread or unclassified message bodies not fetched"] };
    }
    const messages: LiveMessage[] = [];
    const ids = new Set<string>();
    let complete = false;
    for (let messagePage = 0; messagePage < 50; messagePage++) {
      const response = messagePageSchema.parse(await this.read("aula.messages.get_thread", { threadId: thread.id, page: messagePage }, signal));
      if (response.page !== undefined && response.page !== messagePage || !response.messages.length && response.moreMessagesExist) throw new SourceError("incomplete");
      for (const message of response.messages) {
        if (ids.has(message.id)) throw new SourceError("incomplete");
        ids.add(message.id);
        messages.push(message);
      }
      if (!response.moreMessagesExist) { complete = true; break; }
    }
    if (!complete) throw new SourceError("incomplete");
    const after = threadPageSchema.parse(await this.read("aula.messages.list_threads", { page }, signal));
    const current = after.threads.find((item) => item.id === thread.id);
    if (current?.sensitive) return { ...base, items: [], removedIds: [String(thread.id)], issues: ["incomplete"], exclusions: ["Sensitive messages not fetched"] };
    if (!current || after.page !== page || current.read !== thread.read) throw new SourceError("incomplete");
    const normalized = this.capture([messages], () => normalizeThread(thread, messages, this.profile, this.now));
    return { ...base, ...normalized };
  }
}
