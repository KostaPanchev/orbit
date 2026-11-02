import { describe, expect, it } from "vitest";
import { initialAgenda, scenarios, suggestions } from "@/demo/fixtures";
import { coverageStatus, createInitialState, demoReducer, formatDate, formatSourceTime, inWindow, matchesChild, suggestionDetails } from "@/demo/state";

function suggestion(id: string) {
  const found = suggestions.find((item) => item.id === id);
  if (!found) throw new Error(`Missing fixture ${id}`);
  return found;
}

describe("in-memory demo decisions", () => {
  it("adds a date-only item once, without inventing a time or duration", () => {
    const item = suggestion("trip");
    const action = { type: "approve" as const, suggestion: item, details: suggestionDetails(item, initialAgenda) };
    const state = demoReducer(createInitialState(), action);
    expect(state.agenda.find((event) => event.id === "approved-trip")).toMatchObject({ date: "2026-11-04", time: "", source: item.source });
    expect(state.agenda).toHaveLength(initialAgenda.length + 1);
    expect(demoReducer(state, action)).toBe(state);
  });

  it("keeps an unresolved date in review", () => {
    const item = suggestion("gathering");
    expect(() => demoReducer(createInitialState(), { type: "approve", suggestion: item, details: suggestionDetails(item, initialAgenda) })).toThrow("confirmed date");
  });

  it("revises the linked entry without duplicating it or discarding the edited title", () => {
    const initial = createInitialState();
    const item = suggestion("lantern-update");
    expect(initial.agenda.find((event) => event.id === "lantern")?.date).toBe("2026-11-12");
    const state = demoReducer(initial, { type: "approve", suggestion: item, details: suggestionDetails(item, initial.agenda) });
    expect(state.agenda).toHaveLength(initial.agenda.length);
    expect(state.agenda.find((event) => event.id === "lantern")).toMatchObject({ title: "Lantern walk + raincoats", date: "2026-11-13", time: "16:30", location: "Kindergarten garden", source: item.source });
    expect(initialAgenda.find((event) => event.id === "lantern")?.date).toBe("2026-11-12");
  });

  it("dismisses a revision without changing the existing entry", () => {
    const state = demoReducer(createInitialState(), { type: "dismiss", id: "lantern-update" });
    expect(state.agenda).toEqual(initialAgenda);
    expect(state.decisions["lantern-update"]).toBe("dismissed");
  });

  it("preserves decisions across filters and scenarios, but resets explicitly", () => {
    let state = demoReducer(createInitialState(), { type: "dismiss", id: "trip" });
    state = demoReducer(state, { type: "filter", child: "alex" });
    expect(state.announcement).toBe("Showing Alex.");
    state = demoReducer(state, { type: "scenario", scenario: "partial" });
    expect(state.decisions.trip).toBe("dismissed");
    expect(state.child).toBe("alex");
    const reset = demoReducer(state, { type: "reset" });
    expect(reset.decisions).toEqual({});
    expect(reset.child).toBe("all");
    expect(reset.scenario).toBe("normal");
    expect(reset.agenda).toEqual(initialAgenda);
    expect(createInitialState().decisions).toEqual({});
  });

  it("keeps explicit edits and warns when the date falls outside the displayed window", () => {
    const item = suggestion("trip");
    const details = { title: "My edited trip", date: "2026-12-03", time: "09:00", location: "My meeting point" };
    const state = demoReducer(createInitialState(), { type: "approve", suggestion: item, details });
    expect(state.agenda.at(-1)).toMatchObject(details);
    expect(state.announcement).toContain("outside the displayed 30-day window");
  });
});

describe("dates, filtering and coverage", () => {
  it.each([
    ["2026-11-01", false], ["2026-11-02", true], ["2026-12-01", true], ["2026-12-02", false],
  ])("includes exactly the 30-day window: %s", (date, included) => {
    expect(inWindow(date as string)).toBe(included);
  });

  it("formats fixed dates independently of the browser timezone", () => {
    expect(formatDate("2026-11-02")).toBe("Mon, 2 November");
    expect(formatSourceTime("2026-11-02T07:10:00+01:00")).toContain("07:10");
    expect(formatSourceTime("2026-07-02T07:10:00+02:00")).toContain("07:10");
  });

  it("filters both the school and kindergarten", () => {
    expect(initialAgenda.filter((item) => matchesChild(item, "all"))).toHaveLength(4);
    expect(initialAgenda.filter((item) => matchesChild(item, "emma"))).toHaveLength(2);
    expect(initialAgenda.filter((item) => matchesChild(item, "alex"))).toHaveLength(2);
  });

  it("makes failed or incomplete sources distinct from successful empty checks", () => {
    expect(coverageStatus("partial", "Message")).toContain("Incomplete");
    expect(coverageStatus("partial", "Calendar")).toBe("Checked · demo");
    expect(coverageStatus("empty", "Message")).toBe("Checked · demo");
    for (const scenario of ["error", "stale", "disconnected", "reconnect"] as const) {
      expect(coverageStatus(scenario, "Message")).not.toContain("Checked");
    }
    expect(Object.keys(scenarios)).toHaveLength(10);
  });
});
