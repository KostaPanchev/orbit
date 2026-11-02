import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SchoolScheduleView, TodayView, UpcomingView } from "@/components/demo-views";
import { OrganizerProvider, useOrganizer } from "@/components/organizer-provider";
import { brief, initialAgenda } from "@/demo/fixtures";
import { children, type Snapshot } from "@/domain/model";
import { fictionalLiveSnapshot, fictionalScheduleSnapshot, fictionalLessonSnapshot } from "./live-fixtures";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function Filters() {
  const { setChild } = useOrganizer();
  return <><button onClick={() => setChild("aula-10")}>Pupil filter</button><button onClick={() => setChild("aula-20")}>Kindergarten filter</button></>;
}

function renderView(View: typeof SchoolScheduleView, state = fictionalScheduleSnapshot()) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(state));
  vi.stubGlobal("fetch", fetch);
  render(<OrganizerProvider initialState={state}><Filters /><View /></OrganizerProvider>);
  return fetch;
}

function demoSnapshot(): Snapshot {
  return { ...fictionalLiveSnapshot(), mode: "synthetic", household: children, agenda: initialAgenda, brief: brief.filter((item) => !item.busyOnly) };
}

describe("separated overview, upcoming and school schedule", () => {
  it("keeps live Upcoming intentionally empty even during a refresh with retained events", () => {
    renderView(UpcomingView, { ...fictionalScheduleSnapshot(), job: "running" });
    expect(screen.getByRole("heading", { name: "No upcoming events yet" })).toBeVisible();
    expect(screen.getByText("AI not enabled")).toBeVisible();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.queryByText(/Loading imported/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the school schedule" })).toHaveAttribute("href", "/school-schedule");
  });
  it("keeps only approved demo suggestions in Upcoming with stable entry anchors", () => {
    renderView(UpcomingView, demoSnapshot());
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "Lantern walk + raincoats" })).toHaveAttribute("id", "event-lantern");
    expect(screen.queryByRole("article", { name: "Music afternoon" })).not.toBeInTheDocument();
  });
  it("preserves live Overview previews and its mixed horizon content", () => {
    renderView(TodayView);
    expect(screen.getByRole("heading", { name: "Your Aula, at a glance." })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Fictional school notice" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Fictional calendar visit" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Fictional approved suggestion" })).toBeVisible();
  });
  it("preserves demo Overview briefs and both kinds of horizon entries", () => {
    renderView(TodayView, demoSnapshot());
    expect(screen.getByRole("heading", { name: "A quick reply before the trip" })).toBeVisible();
    expect(screen.getByRole("article", { name: "Music afternoon" })).toBeVisible();
    expect(screen.getByRole("article", { name: "Lantern walk + raincoats" })).toBeVisible();
    expect(screen.getByRole("link", { name: "See approved upcoming events" })).toHaveAttribute("href", "/upcoming");
  });
});

describe("weekly schedule", () => {
  it("displays lesson notes and safe resource links instead of a duplicate title-only calendar card", () => {
    renderView(SchoolScheduleView, fictionalLessonSnapshot());
    const card = screen.getByRole("article", { name: "Fictional calendar visit" });
    expect(card).toHaveTextContent("Læs kapitel 2.");
    expect(card).toHaveTextContent("Fictional class");
    const link = within(card).getByRole("link", { name: /Fictional lesson resource/ });
    expect(link).toHaveAttribute("href", "https://example.invalid/lesson");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getAllByRole("article", { name: "Fictional calendar visit" })).toHaveLength(1);
  });
  it("shows chronological structured cards, accurate times, weekend events and unique multi-day IDs", () => {
    renderView(SchoolScheduleView);
    const monday = screen.getByRole("region", { name: "Mon, 2 November Today" });
    expect(within(monday).getAllByRole("article").map((item) => item.getAttribute("aria-label"))).toEqual(["Fictional morning class", "Fictional later class"]);
    expect(within(monday).getByRole("article", { name: "Fictional morning class" })).toHaveTextContent("08:00 – 09:30");
    const multiDay = screen.getAllByRole("article", { name: "Fictional two-day event" });
    expect(multiDay).toHaveLength(2);
    expect(new Set(multiDay.map((card) => card.id)).size).toBe(2);
    expect(multiDay[0]).toHaveTextContent("4 Nov · All day to 5 Nov");
    expect(screen.getByRole("article", { name: "Fictional date-only event" })).toHaveTextContent("Date only · no time specified");
    expect(screen.getByRole("heading", { name: "Weekend" })).toBeVisible();
    expect(screen.getByRole("article", { name: "Fictional kindergarten weekend" })).toBeVisible();
    expect(screen.getByRole("article", { name: "Fictional household weekend" })).toBeVisible();
    expect(screen.queryByRole("article", { name: "Fictional approved suggestion" })).not.toBeInTheDocument();
  });
  it("bounds week controls to the data window and does not request refreshes", async () => {
    const user = userEvent.setup();
    const fetch = renderView(SchoolScheduleView);
    expect(screen.getByRole("button", { name: "Previous week" })).toBeDisabled();
    for (let week = 0; week < 4; week++) await user.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
    expect(screen.getByRole("article", { name: "Fictional final-window event" })).toBeVisible();
    expect(screen.getAllByText("Outside the available date window")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getByRole("heading", { name: /Mon, 23 November 2026/ })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "This week" }));
    expect(screen.getByRole("button", { name: "Previous week" })).toBeDisabled();
    expect(fetch.mock.calls.every(([, init]) => !init?.body)).toBe(true);
  });
  it("preserves household entries and selected week when filtering children", async () => {
    const user = userEvent.setup();
    renderView(SchoolScheduleView);
    await user.click(screen.getByRole("button", { name: "Kindergarten filter" }));
    expect(screen.queryByRole("article", { name: "Fictional calendar visit" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Fictional kindergarten weekend" })).toBeVisible();
    expect(screen.getByRole("article", { name: "Fictional household weekend" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next week" }));
    await user.click(screen.getByRole("button", { name: "Pupil filter" }));
    expect(screen.getByRole("heading", { name: /Mon, 9 November 2026/ })).toBeVisible();
    expect(screen.getByRole("article", { name: "Fictional next-week class" })).toBeVisible();
  });
  it("distinguishes initial loading from empty days and preserves saved events during failure", () => {
    const state = { ...fictionalLiveSnapshot(), agenda: [], job: "running" as const };
    renderView(SchoolScheduleView, state);
    expect(screen.getByRole("status")).toHaveTextContent("Loading imported calendar events");
    expect(screen.queryByText("No imported events for this selection")).not.toBeInTheDocument();
  });
  it("keeps failure coverage copy and retained calendar cards visible", () => {
    renderView(SchoolScheduleView, { ...fictionalScheduleSnapshot(), syncError: "incomplete", job: "running" });
    expect(screen.getByRole("article", { name: "Fictional calendar visit" })).toBeVisible();
    expect(screen.getByText(/not that excluded or unchecked sources are clear/)).toBeVisible();
  });
  it("marks the start of a partially available week without implying a successful empty check", () => {
    renderView(SchoolScheduleView, { ...fictionalLiveSnapshot(), today: "2026-11-04" });
    expect(screen.getAllByText("Outside the available date window")).toHaveLength(2);
    expect(screen.getAllByText("No imported events for this selection")).toHaveLength(3);
  });
  it("clamps the selection when polling moves the date window to a new week", async () => {
    vi.useFakeTimers();
    const state = fictionalScheduleSnapshot();
    renderView(SchoolScheduleView, state);
    state.today = "2026-11-09";
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByRole("heading", { name: /Mon, 9 November 2026/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous week" })).toBeDisabled();
    expect(screen.getByRole("article", { name: "Fictional next-week class" })).toBeVisible();
  });
});
