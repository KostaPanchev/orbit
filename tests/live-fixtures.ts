import { normalizeEvent, normalizePost, normalizeProfile, normalizeThread, threadSchema } from "../src/server/aula/normalize";
import { LIVE_RETENTION_MS, type AgendaEntry, type Snapshot } from "../src/domain/model";
import { liveWindow } from "../src/domain/dates";
import { normalizeSchoolWeek } from "../src/server/aula/school-plan";

export const LIVE_NOW = Date.parse("2026-11-02T10:00:00Z");
export const fictionalProfiles = {
  profiles: [{ profileId: 9000, children: [
    { id: 10, name: "Fictional pupil", institutionProfile: { institutionName: "Fictional school", institutionCode: "G10" } },
    { id: 20, name: "Fictional preschooler", institutionProfile: { institutionName: "Fictional kindergarten", institutionCode: "G20" } },
  ] }],
};
export const liveProfile = normalizeProfile(fictionalProfiles);
export const fictionalPost = {
  id: 100, title: "Fictional school notice", date: "2026-11-01T10:00:00Z",
  author: "Fictional teacher", content: "Husk regntøj til den fiktive tur.",
  attachments: [{ name: "fictional.pdf", url: "https://example.invalid/?token=FICTIONAL_SECRET" }],
};
export const fictionalEvent = {
  id: 300, title: "Fictional calendar visit", startDateTime: "2026-11-03T08:00:00+01:00",
  endDateTime: "2026-11-03T09:00:00+01:00", allDay: false,
  belongsToProfiles: [10], primaryResource: { name: "Fictional hall" },
};
export function fictionalSchoolWeek() {
  return { childId: 10, complete: true, events: [{
    start: "2026-11-03T08:00:00.0000000", end: "2026/11/03 09:00",
    subject: "Fictional calendar visit", className: "Fictional class", title: "Fictional reading assignment",
    html: '<p>Læs kapitel 2.</p><ul><li>Medbring en bog.</li></ul><a href="https://example.invalid/lesson">Fictional lesson resource</a>',
  }] };
}
export const fictionalThread = threadSchema.parse({
  id: 200, subject: "Fictional message thread", read: true, sensitive: false,
  latestMessage: { sendDateTime: "2026-11-01T11:00:00Z" },
});
export const fictionalMessage = {
  id: "fixture-message-1", sendDateTime: "2026-11-01T11:00:00Z",
  text: { plain: "Dette er en fiktiv besked. Ingen virkelige familiedata." },
  sender: { fullName: "Fictional sender" }, attachments: [],
};
export function liveRecords() {
  return [
    normalizePost(fictionalPost, liveProfile, LIVE_NOW)!,
    normalizeEvent(fictionalEvent, liveProfile, LIVE_NOW)!,
    normalizeThread(fictionalThread, [fictionalMessage], liveProfile, LIVE_NOW)!,
  ];
}
export function fictionalLiveSnapshot(): Snapshot {
  const records = liveRecords();
  return {
    mode: "live", household: liveProfile.household, ...liveWindow(new Date(LIVE_NOW)),
    dataset: "live-aula", scenario: "normal", connected: true, paused: false,
    agenda: records.flatMap((record) => record.structuredEvent ? [record.structuredEvent] : []),
    previews: records.filter((record) => !record.structuredEvent).map((record) => ({ id: record.upstreamId, child: record.child, source: record.source })),
    schoolPlan: [], suggestions: [], brief: [], decisions: {}, lastSuccess: new Date(LIVE_NOW).toISOString(), briefAt: null,
    coverage: ["Message", "Post", "Calendar", "Weekly plan"].map((kind) => ({
      kind: kind as "Message" | "Post" | "Calendar" | "Weekly plan", pages: 1, items: 1, complete: true, error: null,
      checkedAt: new Date(LIVE_NOW).toISOString(), lastSuccess: new Date(LIVE_NOW).toISOString(),
    })),
    job: null, workerOnline: true, syncError: null, stale: false,
  };
}
export function fictionalScheduleSnapshot(): Snapshot {
  const state = fictionalLiveSnapshot();
  const event = (id: string, title: string, date: string, fields: Partial<AgendaEntry> = {}): AgendaEntry => {
    const entry = { ...state.agenda[0], id, title, date, endDate: date, ...fields };
    return { ...entry, source: {
      ...entry.source, id: `fictional-${id}`, title, excerpt: title,
      timestamp: `${date}T${entry.time || "00:00"}:00+01:00`,
    } };
  };
  state.agenda.push(
    event("morning", "Fictional morning class", "2026-11-02", { time: "08:00", endTime: "09:30" }),
    event("later", "Fictional later class", "2026-11-02", { time: "10:00", endTime: "11:00" }),
    event("all-day", "Fictional two-day event", "2026-11-04", { time: "", endTime: "", endDate: "2026-11-06", allDay: true }),
    event("date-only", "Fictional date-only event", "2026-11-06", { time: "", endTime: "" }),
    event("saturday", "Fictional kindergarten weekend", "2026-11-07", { child: "aula-20" }),
    event("sunday", "Fictional household weekend", "2026-11-08", { child: "household" }),
    event("next-week", "Fictional next-week class", "2026-11-09"),
    event("last-day", "Fictional final-window event", "2026-12-01"),
    event("approved", "Fictional approved suggestion", "2026-11-03", { origin: "Approved suggestion" }),
  );
  state.schoolPlan = state.agenda.filter((entry) => entry.origin === "Structured calendar").map((entry) => ({
    ...entry, id: `easyiq-${entry.id}`,
    source: { ...entry.source, id: `easyiq-${entry.source.id}`, kind: "Weekly plan", author: "EasyIQ SkolePortal" },
  }));
  return state;
}
export function fictionalLessonSnapshot(): Snapshot {
  const state = fictionalLiveSnapshot();
  const week = fictionalSchoolWeek();
  week.events[0].end = "2026/11/03 09:30";
  state.schoolPlan = normalizeSchoolWeek(week, liveProfile, 10, "2026-11-02").schoolWeek!.entries;
  const calendar = state.agenda[0];
  state.agenda = [
    { ...calendar, title: "Fictional abbreviated lesson", endTime: "08:45" },
    { ...calendar, id: `${calendar.id}-second-slot`, title: "Fictional abbreviated lesson", time: "08:45", endTime: "09:30" },
    { ...calendar, id: `${calendar.id}-calendar-only`, title: "Fictional calendar-only event", time: "11:00", endTime: "11:45" },
  ];
  return state;
}
export const RETENTION_END = LIVE_NOW + LIVE_RETENTION_MS;
