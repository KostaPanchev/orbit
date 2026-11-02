// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { aulaTimestamp, liveWindow, midnightCopenhagen, normalizeTimestamp } from "@/domain/dates";
import { LIVE_RETENTION_MS } from "@/domain/model";
import { normalizeEvent, normalizePost, normalizeThread, normalizeThreadPreview } from "@/server/aula/normalize";
import { AulaSource } from "@/server/aula/source";
import { SourceError } from "@/server/sources/types";
import type { AulaReader } from "@/server/aula/read-client";
import { fictionalEvent, fictionalMessage, fictionalPost, fictionalThread, liveProfile, LIVE_NOW } from "./live-fixtures";

function readerFixture() {
  const threads = [
    fictionalThread,
    { ...fictionalThread, id: 201, read: false },
    { ...fictionalThread, id: 202, sensitive: true },
    { ...fictionalThread, id: 203, latestMessage: { sendDateTime: "2020-01-01T10:00:00Z" } },
  ];
  const read = vi.fn<AulaReader["read"]>(async (tool, args) => {
    if (tool === "aula.messages.list_threads") return { threads, page: args.page, hasMorePages: false };
    if (tool === "aula.messages.get_thread") return { messages: [fictionalMessage], page: args.page, moreMessagesExist: false };
    if (tool === "aula.posts.list") return { posts: [fictionalPost], count: 1, moreMessagesExist: false };
    if (tool === "aula.calendar.events") return [fictionalEvent];
    throw new Error("Unexpected fixture request");
  });
  return { read, threads };
}
describe("Aula normalization", () => {
  it("preserves original text and drops attachment URLs rather than fetching them", () => {
    const post = normalizePost(fictionalPost, liveProfile, LIVE_NOW)!;
    expect(post.source.excerpt).toBe(fictionalPost.content);
    expect(post.child).toBe("household");
    expect(post.source.attachment).toContain("not processed");
    expect(JSON.stringify(post)).not.toContain("FICTIONAL_SECRET");
    expect(JSON.stringify(post)).not.toContain("example.invalid");
  });
  it("filters source records at the exact 90-day boundary", () => {
    const timestamp = new Date(LIVE_NOW - LIVE_RETENTION_MS).toISOString();
    expect(normalizePost({ ...fictionalPost, date: timestamp }, liveProfile, LIVE_NOW)).toBeNull();
    expect(normalizePost({ ...fictionalPost, date: new Date(LIVE_NOW - LIVE_RETENTION_MS + 1).toISOString() }, liveProfile, LIVE_NOW)).not.toBeNull();
  });
  it("uses explicit all-day facts and does not invent times, authors or audiences", () => {
    const event = normalizeEvent({
      ...fictionalEvent, allDay: true, belongsToProfiles: [10, 20],
      startDateTime: "2026-11-03T00:00:00+01:00", endDateTime: "2026-11-05T00:00:00+01:00",
    }, liveProfile, LIVE_NOW)!;
    expect(event.structuredEvent).toMatchObject({ child: "household", date: "2026-11-03", time: "", endDate: "2026-11-05", allDay: true });
    expect(event.source.timestampLabel).toBe("Event time");
    const inclusiveEnd = normalizeEvent({
      ...fictionalEvent, allDay: true,
      startDateTime: "2026-11-03T00:00:00+01:00", endDateTime: "2026-11-04T23:59:59+01:00",
    }, liveProfile, LIVE_NOW)!;
    expect(inclusiveEnd.structuredEvent?.endDate).toBe("2026-11-05");
    expect(() => normalizeEvent({ ...fictionalEvent, allDay: undefined }, liveProfile, LIVE_NOW)).toThrow(z.ZodError);
    expect(() => normalizeTimestamp("2026-11-03T08:00:00")).toThrow();
    expect(() => normalizeEvent({ ...fictionalEvent, endDateTime: "2026-11-01T10:00:00Z" }, liveProfile, LIVE_NOW)).toThrow(SourceError);
  });
  it("keeps unread previews explicitly separate from fetched message bodies", () => {
    const preview = normalizeThreadPreview({ ...fictionalThread, read: false }, liveProfile, LIVE_NOW)!;
    expect(preview.source.excerpt).toBe(fictionalThread.subject);
    expect(preview.source.notice).toContain("Title preview only");
  });
  it("uses the latest message as the preview and preserves individual source dates for older text", () => {
    const record = normalizeThread(fictionalThread, [
      { ...fictionalMessage, id: "older", sendDateTime: "2026-10-30T10:00:00Z", text: { plain: "Older fictional message." } },
      fictionalMessage,
    ], liveProfile, LIVE_NOW)!;
    expect(record.source.excerpt).toBe(fictionalMessage.text.plain);
    expect(record.source.messages?.map((message) => message.id)).toEqual([fictionalMessage.id, "older"]);
    expect(record.source.messages?.[1].timestamp).toBe("2026-10-30T10:00:00.000Z");
  });
  it("constructs an exact 30-date Copenhagen window across both DST transitions", () => {
    for (const [now, start, end, hours] of [
      ["2026-03-28T12:00:00Z", "2026-03-28", "2026-04-27", 719],
      ["2026-10-24T12:00:00Z", "2026-10-24", "2026-11-23", 721],
    ] as const) {
      const window = liveWindow(new Date(now));
      expect(window.today).toBe(start);
      expect(window.windowEnd).toBe(end);
      expect((Date.parse(normalizeTimestamp(window.end)) - Date.parse(normalizeTimestamp(window.start))) / 3600_000).toBe(hours);
    }
    expect(aulaTimestamp(midnightCopenhagen("2026-03-29"))).toBe("2026-03-29 00:00:00.0000+0100");
    expect(aulaTimestamp(midnightCopenhagen("2026-10-25"))).toBe("2026-10-25 00:00:00.0000+0200");
  });
});
describe("allowlisted live source adapter", () => {
  it("fetches only already-read non-sensitive bodies and compares read state", async () => {
    const reader = readerFixture();
    const adapter = new AulaSource(reader, liveProfile, LIVE_NOW);
    const signal = new AbortController().signal;
    const first = await adapter.page("Message", null, signal);
    expect(first.items[0].source.excerpt).toBe(fictionalMessage.text.plain);
    const unread = await adapter.page("Message", first.nextCursor, signal);
    expect(unread.items[0].source.notice).toContain("Title preview only");
    expect(unread.issues).toContain("incomplete");
    const sensitive = await adapter.page("Message", unread.nextCursor, signal);
    expect(sensitive.items).toEqual([]);
    expect(sensitive.removedIds).toEqual(["202"]);
    const old = await adapter.page("Message", sensitive.nextCursor, signal);
    expect(old.items).toEqual([]);
    expect(old.nextCursor).toBeNull();
    const bodyCalls = reader.read.mock.calls.filter(([tool]) => tool === "aula.messages.get_thread");
    expect(bodyCalls).toHaveLength(1);
    expect(bodyCalls[0][1].threadId).toBe(fictionalThread.id);
    expect(reader.read.mock.calls.every(([tool]) => !tool.includes("mark_read"))).toBe(true);
  });
  it("accepts explicit null attachment and optional sender metadata without losing message text", async () => {
    const reader = readerFixture();
    const original = reader.read.getMockImplementation()!;
    reader.read.mockImplementation(async (tool, args, signal) => tool === "aula.messages.get_thread"
      ? { messages: [{ ...fictionalMessage, attachments: null, sender: null }], page: 0, moreMessagesExist: false }
      : original(tool, args, signal));
    const page = await new AulaSource(reader, liveProfile, LIVE_NOW).page("Message", null, new AbortController().signal);
    expect(page.items[0].source.excerpt).toBe(fictionalMessage.text.plain);
    expect(page.items[0].source.author).toBe("Not supplied by Aula");
    expect(page.items[0].source.attachment).toBeUndefined();
  });
  it("rejects repeated calendar identifiers instead of silently merging occurrences", async () => {
    const reader = readerFixture();
    reader.read.mockResolvedValue([fictionalEvent, { ...fictionalEvent, title: "Another occurrence" }]);
    await expect(new AulaSource(reader, liveProfile, LIVE_NOW).page("Calendar", null, new AbortController().signal)).rejects.toMatchObject({ code: "incomplete" });
  });
  it("reports invalid calendar rows as partial and handles explicit cancellations", async () => {
    const reader = readerFixture();
    reader.read.mockResolvedValue([fictionalEvent, { id: 301, cancelled: true }, { id: 302, title: "Missing dates" }]);
    const page = await new AulaSource(reader, liveProfile, LIVE_NOW).page("Calendar", null, new AbortController().signal);
    expect(page.items).toHaveLength(1);
    expect(page.removedIds).toEqual(["301"]);
    expect(page.issues).toContain("invalid-data");
  });
  it("keeps ongoing events but does not import provider rows outside the exact 30-day window", async () => {
    const reader = readerFixture();
    reader.read.mockResolvedValue([
      { ...fictionalEvent, id: 401, startDateTime: "2026-11-01T08:00:00+01:00", endDateTime: "2026-11-03T09:00:00+01:00" },
      { ...fictionalEvent, id: 402, startDateTime: "2026-12-02T08:00:00+01:00", endDateTime: "2026-12-02T09:00:00+01:00" },
      { ...fictionalEvent, id: 403, startDateTime: "2026-11-01T08:00:00+01:00", endDateTime: "2026-11-01T09:00:00+01:00" },
    ]);
    const page = await new AulaSource(reader, liveProfile, LIVE_NOW).page("Calendar", null, new AbortController().signal);
    expect(page.items.map((item) => item.upstreamId)).toEqual(["401"]);
    expect(page.issues).toEqual([]);
  });
  it("stops a cancelled sync before dispatching requests", async () => {
    const reader = readerFixture();
    const stop = new AbortController();
    stop.abort();
    await expect(new AulaSource(reader, liveProfile, LIVE_NOW, stop.signal).page("Post", null, new AbortController().signal)).rejects.toMatchObject({ code: "interrupted" });
    expect(reader.read).not.toHaveBeenCalled();
  });
});
