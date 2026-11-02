import { DEMO_DATE, WINDOW_END, type AgendaEntry, type Candidate, type ChildFilter, type EventDetails, type Snapshot } from "./model";

export function inWindow(date: string): boolean {
  return date >= DEMO_DATE && date < WINDOW_END;
}
export function matchesChild(item: { child: string }, child: ChildFilter): boolean {
  return child === "all" || item.child === child;
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
  if (!state.workerOnline) return { title: "Local worker is offline", detail: "Saved data is still available. Refresh requests wait until the worker is running; nothing refreshes while the Mac sleeps.", warning: true };
  if (state.job) return { title: state.job === "queued" ? "Refresh queued" : "Refreshing synthetic sources", detail: "The local worker is processing your request. Saved decisions remain available.", warning: false };
  if (state.syncError === "summary-unavailable") return { title: "Synthetic summary processing is unavailable", detail: "The previous brief and its timestamp are preserved. Structured calendar facts remain available. No real AI is used.", warning: true };
  const errors = state.coverage.flatMap((item) => item.error ? [item.error] : []);
  if (errors.includes("disconnected")) return { title: "Synthetic connection is disconnected", detail: "Previous data remains available. No new sources were checked.", warning: true };
  if (errors.includes("reconnect")) return { title: "Synthetic session needs reconnecting", detail: "A simulated expired session prevented refresh. No real account is connected.", warning: true };
  if (state.scenario === "stale") return { title: "This overview may be out of date", detail: "The synthetic stale-data scenario failed to refresh. Previous successful data is retained.", warning: true };
  if (state.syncError) return { title: "Some information could be missing", detail: "Refresh did not complete successfully. Previous successful data is retained; check per-source coverage below.", warning: true };
  if (state.stale) return { title: "This overview may be out of date", detail: "The last successful refresh is overdue. Previously saved information is retained.", warning: true };
  return { title: "Synthetic sources checked", detail: state.scenario === "empty" ? "No new items in the checked response. Existing sources and decisions are retained; absence is not a deletion." : "Fictional messages, posts, and calendar checked. Attachments, weekly plans, and sensitive content are not covered.", warning: false };
}
