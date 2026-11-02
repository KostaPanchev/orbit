import { DEMO_DATE, WINDOW_END, initialAgenda, type AgendaEntry, type ChildFilter, type EventDetails, type Scenario, type SourceKind, type Suggestion } from "./fixtures";

export interface DemoState {
  scenario: Scenario;
  child: ChildFilter;
  agenda: AgendaEntry[];
  decisions: Record<string, "approved" | "dismissed">;
  announcement: string;
}

export type DemoAction =
  | { type: "scenario"; scenario: Scenario }
  | { type: "filter"; child: ChildFilter }
  | { type: "approve"; suggestion: Suggestion; details: EventDetails }
  | { type: "dismiss"; id: string }
  | { type: "announce"; message: string }
  | { type: "reset" };

export function createInitialState(): DemoState {
  return { scenario: "normal", child: "all", agenda: initialAgenda, decisions: {}, announcement: "" };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "scenario":
      return { ...state, scenario: action.scenario, announcement: "Demo scenario changed. No services were contacted." };
    case "filter":
      return { ...state, child: action.child, announcement: `Showing ${action.child === "all" ? "both children" : action.child === "emma" ? "Emma" : "Alex"}.` };
    case "dismiss":
      return { ...state, decisions: { ...state.decisions, [action.id]: "dismissed" }, announcement: "Suggestion dismissed. The existing agenda is unchanged." };
    case "approve": {
      if (!action.details.date || !action.details.title.trim()) {
        throw new Error("An approved demo suggestion requires a title and a confirmed date.");
      }
      if (state.decisions[action.suggestion.id]) return state;
      const id = action.suggestion.replacesId ?? `approved-${action.suggestion.id}`;
      const entry: AgendaEntry = { ...action.details, id, child: action.suggestion.child, source: action.suggestion.source, origin: "Approved suggestion" };
      return {
        ...state,
        agenda: [...state.agenda.filter((item) => item.id !== id), entry],
        decisions: { ...state.decisions, [action.suggestion.id]: "approved" },
        announcement: `Added to demo agenda. ${action.suggestion.replacesId ? "Revision applied; your title is kept unless you edited it. " : ""}${inWindow(entry.date) ? "" : "This date is outside the displayed 30-day window. "}Changes reset on page reload.`,
      };
    }
    case "announce":
      return { ...state, announcement: action.message };
    case "reset":
      return { ...createInitialState(), announcement: "Demo reset. Original fictional items restored." };
  }
}

export function inWindow(date: string): boolean {
  return date >= DEMO_DATE && date < WINDOW_END;
}

export function matchesChild(item: { child: string }, child: ChildFilter): boolean {
  return child === "all" || item.child === child;
}

export function suggestionDetails(suggestion: Suggestion, agenda: AgendaEntry[]): EventDetails {
  const previous = agenda.find((item) => item.id === suggestion.replacesId);
  return { title: previous?.title ?? suggestion.title, date: suggestion.date ?? "", time: suggestion.time, location: suggestion.location };
}

export function coverageStatus(scenario: Scenario, kind: SourceKind): string {
  if (scenario === "loading") return "Checking (simulated)";
  if (scenario === "partial") return kind === "Message" ? "Incomplete · previous data" : "Checked · demo";
  if (scenario === "stale") return "Overdue · previous data";
  if (scenario === "error") return "Failed · previous data";
  if (scenario === "disconnected") return "Disconnected · previous data";
  if (scenario === "reconnect") return "Session expired · previous data";
  return "Checked · demo";
}

export function formatDate(date: string, short = false): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: short ? "short" : "long", weekday: "short", timeZone: "UTC" }).formatToParts(new Date(`${date}T12:00:00Z`)).map(({ type, value }) => [type, value]));
  return `${short ? "" : `${parts.weekday}, `}${parts.day} ${parts.month}`;
}

export function formatSourceTime(timestamp: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Copenhagen" }).formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]));
  return `${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}`;
}
