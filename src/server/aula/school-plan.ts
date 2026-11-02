import { z } from "zod";
import { addDays, isoWeek, localDateTime, midnightCopenhagen, normalizeTimestamp, startOfWeek } from "../../domain/dates";
import { LIVE_RETENTION_MS, sourceRecordSchema, type AgendaEntry, type SourceRecord } from "../../domain/model";
import { AulaReadError, type AulaReader } from "./read-client";
import type { LiveProfile } from "./normalize";
import { lessonContent } from "./lesson-content";
import { SourceError, type SourcePage } from "../sources/types";

const text = z.string().max(100_000);
export const schoolPlanResponse = z.object({
  childId: z.number().int().positive(), complete: z.literal(true),
  events: z.array(z.object({ start: text, end: text, subject: text, className: text, title: text, html: text })).max(1000),
});

export function schoolDateTime(value: string) {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return localDateTime(new Date(normalizeTimestamp(value)));
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,7})?)?)?$/.exec(value);
  if (!match) throw new SourceError("invalid-data");
  const date = z.iso.date().parse(`${match[1]}-${match[2]}-${match[3]}`);
  const time = match[4] ? z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).parse(`${match[4]}:${match[5]}`) : "";
  if (match[6] && Number(match[6]) > 59) throw new SourceError("invalid-data");
  return { date, time };
}

function lessonTimestamp(value: string) {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return normalizeTimestamp(value);
  const { date, time } = schoolDateTime(value);
  if (!time) return midnightCopenhagen(date).toISOString();
  const utc = Date.parse(`${date}T${time}:00Z`);
  const matches = [1, 2].map((hours) => new Date(utc - hours * 3600_000)).filter((candidate) => {
    const local = localDateTime(candidate);
    return local.date === date && local.time === time;
  });
  if (matches.length !== 1) throw new SourceError("invalid-data");
  return matches[0].toISOString();
}

export function normalizeSchoolWeek(raw: unknown, profile: LiveProfile, childId: number, monday: string): SourceRecord {
  const data = schoolPlanResponse.parse(raw);
  if (data.childId !== childId || !profile.profileIds.includes(childId)) throw new SourceError("invalid-data");
  const child = `aula-${childId}`;
  const id = `easyiq-${childId}-${monday}`;
  const timestamp = midnightCopenhagen(monday).toISOString();
  const source = { id, kind: "Weekly plan" as const, title: "EasyIQ SkolePortal class schedule", author: "EasyIQ SkolePortal", timestamp, timestampLabel: "Event time" as const, excerpt: "Structured weekly class schedule from EasyIQ SkolePortal." };
  const entries: AgendaEntry[] = data.events.map((event, index) => {
    const start = schoolDateTime(event.start);
    const end = event.end ? schoolDateTime(event.end) : null;
    if (start.date < monday || start.date >= addDays(monday, 7) ||
      end && (end.date < start.date || end.date === start.date && start.time && end.time && end.time < start.time)) throw new SourceError("invalid-data");
    const subject = lessonContent(event.subject).text;
    const chapter = lessonContent(event.title).text;
    const title = subject || chapter || "Class (subject not supplied)";
    const content = lessonContent(event.html);
    const notes = [chapter && chapter !== title ? chapter : "", content.text].filter(Boolean).join("\n\n");
    return {
      id: `${id}-${index}`, child, title, date: start.date, time: start.time, location: "", origin: "Structured calendar",
      ...(end ? { endDate: end.date, endTime: end.time } : {}),
      className: lessonContent(event.className).text, notes,
      source: { ...source, id: `${id}-${index}`, title, timestamp: lessonTimestamp(event.start),
        excerpt: notes || title, links: content.links,
        notice: `Original EasyIQ SkolePortal lesson content; no AI interpretation.${content.omittedLinks ? " Some unsupported or authentication links were omitted." : ""}${!notes ? " No lesson notes supplied." : ""}`,
      },
    };
  });
  return sourceRecordSchema.parse({
    accountScope: profile.accountScope, upstreamId: id, child, source, schoolWeek: { start: monday, entries },
    retainUntil: new Date(Date.parse(timestamp) + LIVE_RETENTION_MS).toISOString(),
  });
}

export class SchoolPlanSource {
  constructor(private readonly reader: AulaReader, private readonly profile: LiveProfile, private readonly today: string, private readonly windowEnd: string) {}

  async page(cursor: string | null, signal: AbortSignal): Promise<SourcePage> {
    const weeks: string[] = [];
    for (let week = startOfWeek(this.today); week < this.windowEnd; week = addDays(week, 7)) weeks.push(week);
    const requests = this.profile.profileIds.flatMap((childId) => weeks.map((monday) => ({ childId, monday })));
    const index = cursor === null ? 0 : z.coerce.number().int().nonnegative().parse(cursor);
    const request = requests[index];
    if (!request) throw new SourceError("invalid-data");
    const nextCursor = index + 1 < requests.length ? String(index + 1) : null;
    const institution = this.profile.schools.find((school) => school.childId === request.childId);
    const base = { nextCursor, complete: nextCursor === null };
    if (!institution) return { ...base, items: [], pagesRead: 0, issues: ["incomplete"], exclusions: ["EasyIQ institution metadata is unavailable for a child"] };
    try {
      const raw = await this.reader.read("aula.ugeplan.easyiq_skoleportal", {
        childIds: [request.childId], institutionCodes: [institution.institutionCode], isoWeek: isoWeek(request.monday),
      }, signal);
      return { ...base, pagesRead: 1, items: [normalizeSchoolWeek(raw, this.profile, request.childId, request.monday)] };
    } catch (error) {
      if (!(error instanceof AulaReadError) && !(error instanceof SourceError) && !(error instanceof z.ZodError)) throw error;
      const code = error instanceof AulaReadError && error.code === "unsupported-source" ? "incomplete" : error instanceof z.ZodError || error instanceof SourceError ? "invalid-data" : error instanceof AulaReadError && error.code === "timeout" ? "timeout" : "unavailable";
      return { ...base, items: [], pagesRead: 1, issues: [code], exclusions: [code === "incomplete" ? "EasyIQ SkolePortal is not available for a child; other sources are retained" : "An EasyIQ child/week could not be checked; previously imported lesson content is retained"] };
    }
  }
}
