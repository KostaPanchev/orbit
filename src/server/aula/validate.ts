import { createHash } from "node:crypto";
import { z } from "zod";
import { AulaReadError, type AulaReader, type ReadFailure } from "./read-client";

const id = z.number().int().positive();
const child = z.object({ id });
const profilesSchema = z.object({ profiles: z.array(z.object({ profileId: id, children: z.array(child) })).min(1) });
const postPageSchema = z.object({
  posts: z.array(z.object({ id })), count: z.number().int().nonnegative(), moreMessagesExist: z.boolean(),
});
const threadSchema = z.object({ id, read: z.boolean() });
const threadsSchema = z.object({
  threads: z.array(threadSchema), page: z.number().int().nonnegative(), hasMorePages: z.boolean(),
});
const messagesSchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())),
  page: z.number().int().nonnegative().optional(), moreMessagesExist: z.boolean(),
});
const calendarSchema = z.array(z.object({
  startDateTime: z.string().min(1), endDateTime: z.string().min(1),
}));
const MAX_PAGES = 50;
const SAMPLE_THREADS = 3;

interface Check {
  status: "passed" | "blocked" | "not-checked";
  items: number;
  pages: number;
  reason?: ReadFailure;
}
export interface AulaValidationReport {
  version: 1;
  outcome: "sample-checks-passed" | "blocked";
  profiles: Check;
  children: number;
  posts: Check;
  threadList: Check;
  threadMessages: Check;
  calendar: Check;
  calendarWindow: "this_week";
  sampledThreads: number;
  sampledUnreadThreads: number;
  readMarkers: "unchanged-in-sample" | "not-tested" | "changed-or-inconclusive";
  exclusions: string[];
  remaining: string[];
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AulaReadError("response-shape");
  return result.data;
}
function check(): Check { return { status: "not-checked", items: 0, pages: 0 }; }
async function checked(target: Check, action: () => Promise<void>) {
  try { await action(); target.status = "passed"; }
  catch (error) {
    target.status = "blocked";
    target.reason = error instanceof AulaReadError ? error.code : "transport";
  }
}
function uniqueIds(ids: number[], seen: Set<number>) {
  for (const id of ids) {
    if (seen.has(id)) throw new AulaReadError("incomplete");
    seen.add(id);
  }
}

export async function validateAula(reader: AulaReader, signal: AbortSignal): Promise<AulaValidationReport> {
  const report: AulaValidationReport = {
    version: 1, outcome: "blocked", profiles: check(), children: 0,
    posts: check(), threadList: check(), threadMessages: check(), calendar: check(),
    calendarWindow: "this_week", sampledThreads: 0, sampledUnreadThreads: 0, readMarkers: "not-tested",
    exclusions: ["attachments", "weekly-plan providers", "sensitive/step-up-only content"],
    remaining: ["unread read-marker behavior", "excluded-source coverage", "full Phase 3 acceptance review"],
  };
  let profileIds: number[] = [];
  await checked(report.profiles, async () => {
    const data = parse(profilesSchema, await reader.read("aula.profiles.list", {}, signal));
    report.profiles.items = data.profiles.length;
    report.profiles.pages = 1;
    if (data.profiles.length !== 1) throw new AulaReadError("profile-selection");
    profileIds = [...new Set(data.profiles.flatMap((profile) => profile.children.map((child) => child.id)))];
    report.children = profileIds.length;
    if (!profileIds.length) throw new AulaReadError("profile-selection");
  });
  if (report.profiles.status !== "passed") return report;

  await checked(report.calendar, async () => {
    const data = parse(calendarSchema, await reader.read("aula.calendar.events", { profileIds, range: "this_week" }, signal));
    report.calendar.items = data.length;
    report.calendar.pages = 1;
  });

  await checked(report.posts, async () => {
    const seen = new Set<number>();
    let index = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = parse(postPageSchema, await reader.read("aula.posts.list", { index, limit: 50, onlyUnread: false }, signal));
      if (data.count !== data.posts.length || !data.posts.length && data.moreMessagesExist) throw new AulaReadError("incomplete");
      uniqueIds(data.posts.map((post) => post.id), seen);
      report.posts.pages++;
      report.posts.items += data.posts.length;
      if (!data.moreMessagesExist) return;
      index += data.posts.length;
    }
    throw new AulaReadError("limit");
  });

  const threads: Array<{ id: number; read: boolean; page: number }> = [];
  await checked(report.threadList, async () => {
    const seen = new Set<number>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = parse(threadsSchema, await reader.read("aula.messages.list_threads", { page }, signal));
      if (data.page !== page || !data.threads.length && data.hasMorePages) throw new AulaReadError("incomplete");
      uniqueIds(data.threads.map((thread) => thread.id), seen);
      threads.push(...data.threads.map((thread) => ({ ...thread, page })));
      report.threadList.pages++;
      report.threadList.items += data.threads.length;
      if (!data.hasMorePages) return;
    }
    throw new AulaReadError("limit");
  });

  if (report.threadList.status === "passed") {
    await checked(report.threadMessages, async () => {
      // Prefer already-read threads; the sample is not a claim about the full mailbox.
      const sample = [...threads].sort((a, b) => Number(b.read) - Number(a.read)).slice(0, SAMPLE_THREADS);
      if (!sample.length) throw new AulaReadError("incomplete");
      for (const thread of sample) {
        const seenPages = new Set<string>();
        let complete = false;
        try {
          for (let page = 0; page < MAX_PAGES; page++) {
            const data = parse(messagesSchema, await reader.read("aula.messages.get_thread", { threadId: thread.id, page }, signal));
            if (data.page !== undefined && data.page !== page || !data.messages.length && data.moreMessagesExist) throw new AulaReadError("incomplete");
            const hash = createHash("sha256").update(JSON.stringify(data.messages)).digest("hex");
            if (seenPages.has(hash)) throw new AulaReadError("incomplete");
            seenPages.add(hash);
            report.threadMessages.pages++;
            report.threadMessages.items += data.messages.length;
            if (!data.moreMessagesExist) { complete = true; break; }
          }
          if (!complete) throw new AulaReadError("limit");
          report.sampledThreads++;
          if (!thread.read) report.sampledUnreadThreads++;
        } finally {
          const after = parse(threadsSchema, await reader.read("aula.messages.list_threads", { page: thread.page }, signal));
          const current = after.threads.find((item) => item.id === thread.id);
          if (after.page !== thread.page || !current || current.read !== thread.read) {
            report.readMarkers = "changed-or-inconclusive";
            throw new AulaReadError("read-state-changed");
          }
        }
      }
      report.readMarkers = "unchanged-in-sample";
      if (report.sampledUnreadThreads) report.remaining = report.remaining.filter((item) => item !== "unread read-marker behavior");
    });
  }
  if ([report.profiles, report.calendar, report.posts, report.threadList, report.threadMessages].every((item) => item.status === "passed")) {
    report.outcome = "sample-checks-passed";
  }
  return report;
}
