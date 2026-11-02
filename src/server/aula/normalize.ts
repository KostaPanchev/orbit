import { createHash } from "node:crypto";
import { z } from "zod";
import { addDays, localDateTime, normalizeTimestamp } from "../../domain/dates";
import { LIVE_RETENTION_MS, sourceRecordSchema, type Household, type SourceRecord } from "../../domain/model";
import { SourceError } from "../sources/types";

const id = z.number().int().positive();
const name = z.string().trim().min(1).max(500);
export const profileDataSchema = z.object({
  profiles: z.array(z.object({
    profileId: id,
    children: z.array(z.object({
      id, name,
      institutionProfile: z.object({ institutionName: z.string().optional() }).optional(),
    })).min(1),
  })).length(1),
});
export interface LiveProfile { accountScope: string; household: Household; profileIds: number[] }
export function normalizeProfile(raw: unknown): LiveProfile {
  const { profiles: [profile] } = profileDataSchema.parse(raw);
  const household: Household = { household: { name: "Household", institution: "Audience not specified by the source", initial: "H" } };
  for (const child of profile.children) {
    household[`aula-${child.id}`] = { name: child.name, initial: Array.from(child.name)[0], institution: child.institutionProfile?.institutionName ?? "Institution not supplied" };
  }
  return {
    accountScope: `aula-${createHash("sha256").update(String(profile.profileId)).digest("hex")}`,
    household, profileIds: [...new Set(profile.children.map((child) => child.id))],
  };
}
const postSchema = z.object({
  id, title: z.string().trim().min(1).max(300), date: z.string(), author: z.string().optional(),
  content: z.string().max(100_000), attachments: z.array(z.unknown()).optional(),
});
export const threadSchema = z.object({
  id, subject: z.string().trim().min(1).max(300), read: z.boolean(), sensitive: z.boolean().optional(),
  latestMessage: z.object({ sendDateTime: z.string() }),
});
export type LiveThread = z.infer<typeof threadSchema>;
export const threadPageSchema = z.object({
  threads: z.array(threadSchema), page: z.number().int().nonnegative(), hasMorePages: z.boolean(),
});
export const messageSchema = z.object({
  id: z.string().min(1), sendDateTime: z.string(),
  text: z.object({ plain: z.string().max(100_000) }),
  sender: z.object({ fullName: z.string().nullable().optional() }).nullable().optional(),
  attachments: z.array(z.unknown()).nullable().optional(),
});
export const messagePageSchema = z.object({
  messages: z.array(messageSchema), page: z.number().int().nonnegative().optional(), moreMessagesExist: z.boolean(),
});
export type LiveMessage = z.infer<typeof messageSchema>;
const eventSchema = z.object({
  id, title: z.string().trim().min(1).max(300), startDateTime: z.string(), endDateTime: z.string(),
  allDay: z.boolean(), belongsToProfiles: z.array(id),
  primaryResource: z.object({ name: z.string() }).optional(),
});
export const cancellationSchema = z.object({
  id, cancelled: z.boolean().optional(), isCancelled: z.boolean().optional(), status: z.string().optional(),
});
function until(timestamp: string) { return new Date(Date.parse(timestamp) + LIVE_RETENTION_MS).toISOString(); }
function retained(record: SourceRecord, now: number): SourceRecord | null {
  const parsed = sourceRecordSchema.parse(record);
  if (parsed.retainUntil && Date.parse(parsed.retainUntil) <= now) return null;
  return parsed;
}
export function normalizePost(raw: unknown, profile: LiveProfile, now: number): SourceRecord | null {
  const post = postSchema.parse(raw);
  const timestamp = normalizeTimestamp(post.date);
  return retained({
    accountScope: profile.accountScope, upstreamId: String(post.id), child: "household", retainUntil: until(timestamp),
    source: {
      id: `aula-post-${post.id}`, kind: "Post", title: post.title, timestamp,
      author: post.author?.trim() || "Not supplied by Aula", excerpt: post.content.trim() || post.title,
      ...(!post.content.trim() ? { notice: "Title preview only: Aula supplied no text body." } : {}),
      ...(post.attachments?.length ? { attachment: `${post.attachments.length} attachment(s) not processed` } : {}),
    },
  }, now);
}
export function normalizeThreadPreview(thread: LiveThread, profile: LiveProfile, now: number): SourceRecord | null {
  const timestamp = normalizeTimestamp(thread.latestMessage.sendDateTime);
  return retained({
    accountScope: profile.accountScope, upstreamId: String(thread.id), child: "household", retainUntil: until(timestamp),
    source: {
      id: `aula-message-${thread.id}`, kind: "Message", title: thread.subject, timestamp, timestampLabel: "Latest message",
      author: "Not supplied by Aula", excerpt: thread.subject,
      notice: "Title preview only. Unread message bodies are not fetched until unread read-marker behavior is verified. Open Aula to read this thread.",
    },
  }, now);
}
export function normalizeThread(thread: LiveThread, messages: LiveMessage[], profile: LiveProfile, now: number): SourceRecord | null {
  const recent = messages.map((message) => ({ ...message, timestamp: normalizeTimestamp(message.sendDateTime) }))
    .filter((message) => Date.parse(message.timestamp) + LIVE_RETENTION_MS > now)
    .toSorted((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
  if (!recent.length) return null;
  if (recent.reduce((total, message) => total + message.text.plain.length, 0) > 100_000) throw new SourceError("incomplete");
  const latest = recent[recent.length - 1];
  const excerpt = latest.text.plain.trim();
  const authors = [...new Set(recent.flatMap((message) => message.sender?.fullName?.trim() ? [message.sender.fullName.trim()] : []))];
  const attachments = recent.reduce((sum, message) => sum + (message.attachments?.length ?? 0), 0);
  return retained({
    accountScope: profile.accountScope, upstreamId: String(thread.id), child: "household", retainUntil: until(recent[0].timestamp),
    source: {
      id: `aula-message-${thread.id}`, kind: "Message", title: thread.subject, timestamp: recent[recent.length - 1].timestamp,
      timestampLabel: "Latest message", excerpt: excerpt || thread.subject,
      author: authors.length === 1 ? authors[0] : authors.length ? "Multiple participants" : "Not supplied by Aula",
      notice: excerpt ? "Latest message preview. View source for individual messages and their sent dates within the last 90 days. No AI summary." : "Title preview only: the latest message has no text. View source for dated messages.",
      messages: recent.toReversed().map((message) => ({
        id: message.id, timestamp: message.timestamp,
        author: message.sender?.fullName?.trim() || "Not supplied by Aula", excerpt: message.text.plain,
      })),
      ...(attachments ? { attachment: `${attachments} attachment(s) not processed` } : {}),
    },
  }, now);
}
export function normalizeEvent(raw: unknown, profile: LiveProfile, now: number): SourceRecord | null {
  const event = eventSchema.parse(raw);
  const start = normalizeTimestamp(event.startDateTime);
  const end = normalizeTimestamp(event.endDateTime);
  if (Date.parse(end) < Date.parse(start)) throw new SourceError("invalid-data");
  const startLocal = localDateTime(new Date(start));
  const endLocal = localDateTime(new Date(end));
  const endDate = event.allDay && (endLocal.time !== "00:00" || endLocal.seconds !== "00" || new Date(end).getMilliseconds() !== 0)
    ? addDays(endLocal.date, 1) : endLocal.date;
  const audiences = [...new Set(event.belongsToProfiles.filter((id) => profile.profileIds.includes(id)))];
  const child = audiences.length === 1 ? `aula-${audiences[0]}` : "household";
  const source = {
    id: `aula-calendar-${event.id}`, kind: "Calendar" as const, title: event.title,
    author: "Aula calendar", timestamp: start, timestampLabel: "Event time" as const, excerpt: event.title,
    notice: "Structured calendar fields supplied by Aula. The excerpt is the original event title; no AI interpretation.",
  };
  return retained({
    accountScope: profile.accountScope, upstreamId: String(event.id), child, source, retainUntil: until(start),
    structuredEvent: {
      id: String(event.id), child, source, title: event.title, date: startLocal.date,
      time: event.allDay ? "" : startLocal.time, location: event.primaryResource?.name ?? "",
      endDate, endTime: event.allDay ? "" : endLocal.time, allDay: event.allDay, origin: "Structured calendar",
    },
  }, now);
}
