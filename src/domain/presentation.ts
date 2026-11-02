import { DEMO_DATE, WINDOW_END, type AgendaEntry, type Candidate, type ChildFilter, type EventDetails, type Snapshot } from "./model";
import { addDays } from "./dates";

export function inWindow(date: string, start = DEMO_DATE, end = WINDOW_END): boolean {
  return date >= start && date < end;
}
export function eventInWindow(entry: AgendaEntry, start = DEMO_DATE, end = WINDOW_END) {
  return inWindow(entry.date, start, end) || entry.date < start && entry.date < end &&
    Boolean(entry.endDate && (entry.allDay ? entry.endDate > start : entry.endDate >= start));
}
export function matchesChild(item: { child: string }, child: ChildFilter): boolean {
  return child === "all" || item.child === child || item.child === "household";
}
export function scheduleWeek(agenda: AgendaEntry[], weekStart: string, windowStart: string, windowEnd: string) {
  const entries = agenda.filter((entry) => entry.origin === "Structured calendar").toSorted((a, b) =>
    (a.allDay ? "" : a.time).localeCompare(b.allDay ? "" : b.time) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const available = inWindow(date, windowStart, windowEnd);
    return {
      date, available,
      entries: available ? entries.filter((entry) => {
        if (entry.date === date) return true;
        if (entry.date > date || !entry.endDate) return false;
        return entry.endDate > date || !entry.allDay && entry.endDate === date && entry.endTime !== "00:00";
      }) : [],
    };
  });
}
export function suggestionDetails(suggestion: Candidate, agenda: AgendaEntry[]): EventDetails {
  const previous = agenda.find((item) => item.id === suggestion.replacesId);
  const details = { title: suggestion.title, date: suggestion.date ?? "", time: suggestion.time, location: suggestion.location };
  for (const field of suggestion.editedFields) {
    if (previous) details[field] = previous[field];
  }
  return details;
}
export function formatDate(date: string, short = false): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: short ? "short" : "long", weekday: "short", timeZone: "UTC" }).formatToParts(new Date(`${date}T12:00:00Z`)).map(({ type, value }) => [type, value]));
  return `${short ? "" : `${parts.weekday}, `}${parts.day} ${parts.month}`;
}
export function formatSourceTime(timestamp: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Copenhagen" }).formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]));
  return `${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}`;
}
export function syncStatus(state: Snapshot) {
  const live = state.mode === "live";
  if (live && !state.connected) return { title: "Aula is disconnected", detail: "No local Aula session is saved. Imported data is retained until expiry or deletion. Use guarded terminal login to reconnect.", warning: true };
  if (live && state.paused) return { title: "Aula refresh is paused", detail: "No new data is being imported. You can explicitly resume refresh when ready.", warning: true };
  if (!state.workerOnline) return { title: "Local worker is offline", detail: "Saved data is still available. Refresh requests wait until the worker is running; nothing refreshes while the Mac sleeps.", warning: true };
  if (state.job) return { title: state.job === "queued" ? "Local operation queued" : live ? "Processing Aula data locally" : "Refreshing synthetic sources", detail: "The local worker is processing your request. Saved decisions remain available.", warning: false };
  if (state.syncError === "summary-unavailable") return { title: "Synthetic summary processing is unavailable", detail: "The previous brief and its timestamp are preserved. Structured calendar facts remain available. No real AI is used.", warning: true };
  const errors = state.coverage.flatMap((item) => item.error ? [item.error] : []);
  if (errors.includes("disconnected")) return { title: live ? "Aula session or local safeguards need attention" : "Synthetic connection is disconnected", detail: "Previous data remains available. No new sources were checked.", warning: true };
  if (errors.includes("reconnect")) return { title: live ? "Aula session needs reconnecting" : "Synthetic session needs reconnecting", detail: live ? "Refresh could not use this session or the account changed. Use guarded terminal login; delete the previous live dataset before changing households." : "A simulated expired session prevented refresh. No real account is connected.", warning: true };
  if (state.scenario === "stale") return { title: "This overview may be out of date", detail: "The synthetic stale-data scenario failed to refresh. Previous successful data is retained.", warning: true };
  if (state.syncError) return { title: "Some information could be missing", detail: "Refresh did not complete successfully. Previous successful data is retained; check per-source coverage below.", warning: true };
  if (state.stale) return { title: "This overview may be out of date", detail: "The last successful refresh is overdue. Previously saved information is retained.", warning: true };
  return { title: live ? "Core Aula sources checked" : "Synthetic sources checked", detail: live ? "Aula sources and EasyIQ SkolePortal lesson content. AI is disabled. Attachments, other weekly-plan providers, sensitive content, and unread message bodies are excluded." : state.scenario === "empty" ? "No new items in the checked response. Existing sources and decisions are retained; absence is not a deletion." : "Fictional messages, posts, and calendar checked. Attachments, weekly plans, and sensitive content are not covered.", warning: false };
}
