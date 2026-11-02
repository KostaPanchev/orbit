import { describe, expect, it } from "vitest";
import { initialAgenda } from "@/demo/fixtures";
import { eventDetailsSchema, type AgendaEntry } from "@/domain/model";
import { formatDate, formatSourceTime, inWindow, matchesChild, scheduleWeek } from "@/domain/presentation";
import { startOfWeek } from "@/domain/dates";

describe("dates, filtering and validation", () => {
  it.each([
    ["2026-11-01", false], ["2026-11-02", true], ["2026-12-01", true], ["2026-12-02", false],
  ])("includes exactly the 30-day window: %s", (date, included) => {
    expect(inWindow(date as string)).toBe(included);
  });

  describe("school schedule weeks", () => {
    const entry = (id: string, fields: Partial<AgendaEntry> = {}): AgendaEntry => ({
      ...initialAgenda[0], id, title: id, date: "2026-11-02", time: "08:00", origin: "Structured calendar", ...fields,
    });
    it.each([
      ["2026-11-02", "2026-11-02"], ["2026-11-08", "2026-11-02"],
      ["2027-01-01", "2026-12-28"], ["2026-03-29", "2026-03-23"], ["2026-10-25", "2026-10-19"],
    ])("starts %s on Monday %s", (date, monday) => {
      expect(startOfWeek(date)).toBe(monday);
    });
    it("separates structured entries and orders date-only and timed entries deterministically", () => {
      const week = scheduleWeek([
        entry("late", { time: "12:00" }), entry("z"), entry("a"),
        entry("date-only", { time: "" }), entry("all-day", { time: "", allDay: true }),
        entry("approved", { origin: "Approved suggestion" }),
      ], "2026-11-02", "2026-11-02", "2026-12-02");
      expect(week[0].entries.map(({ id }) => id)).toEqual(["all-day", "date-only", "a", "z", "late"]);
      expect(week).toHaveLength(7);
    });
    it("preserves household and weekend events under a child filter", () => {
      const agenda = [
        entry("household", { child: "household", date: "2026-11-07" }),
        entry("kindergarten", { child: "alex", date: "2026-11-08" }), entry("school", { child: "emma" }),
      ].filter((item) => matchesChild(item, "alex"));
      const week = scheduleWeek(agenda, "2026-11-02", "2026-11-02", "2026-12-02");
      expect(week.flatMap(({ entries }) => entries.map(({ id }) => id))).toEqual(["household", "kindergarten"]);
    });
    it("does not present unavailable dates as checked empty days", () => {
      const first = scheduleWeek([entry("past")], "2026-11-02", "2026-11-04", "2026-12-04");
      expect(first.map(({ available }) => available)).toEqual([false, false, true, true, true, true, true]);
      expect(first[0].entries).toEqual([]);
      const last = scheduleWeek([], "2026-11-30", "2026-11-04", "2026-12-04");
      expect(last.map(({ available }) => available)).toEqual([true, true, true, true, false, false, false]);
    });
    it("repeats overlapping events without including exclusive ends or inventing durations", () => {
      const week = scheduleWeek([
        entry("all-day", { date: "2026-11-01", time: "", allDay: true, endDate: "2026-11-04" }),
        entry("midnight", { endDate: "2026-11-04", endTime: "00:00" }),
        entry("overnight", { endDate: "2026-11-04", endTime: "09:00" }),
        entry("date-only", { time: "" }), entry("no-end"),
      ], "2026-11-02", "2026-11-02", "2026-12-02");
      expect(week[0].entries).toHaveLength(5);
      expect(week[1].entries.map(({ id }) => id)).toEqual(["all-day", "midnight", "overnight"]);
      expect(week[2].entries.map(({ id }) => id)).toEqual(["overnight"]);
      expect(week[3].entries).toEqual([]);
    });
    it("groups date-only values consistently across DST weeks", () => {
      for (const [monday, sunday, end] of [["2026-03-23", "2026-03-29", "2026-03-30"], ["2026-10-19", "2026-10-25", "2026-10-26"]]) {
        const week = scheduleWeek([entry("weekend", { date: sunday })], monday, monday, end);
        expect(week[6].date).toBe(sunday);
        expect(week[6].entries).toHaveLength(1);
      }
    });
  });
  it("formats Copenhagen timestamps across both daylight-saving transitions", () => {
    expect(formatDate("2026-11-02")).toBe("Mon, 2 November");
    expect(formatSourceTime("2026-03-29T00:30:00Z")).toContain("01:30");
    expect(formatSourceTime("2026-03-29T01:30:00Z")).toContain("03:30");
    expect(formatSourceTime("2026-10-25T00:30:00Z")).toContain("02:30");
    expect(formatSourceTime("2026-10-25T01:30:00Z")).toContain("02:30");
  });
  it("filters both the school and kindergarten", () => {
    expect(initialAgenda.filter((item) => matchesChild(item, "all"))).toHaveLength(4);
    expect(initialAgenda.filter((item) => matchesChild(item, "emma"))).toHaveLength(2);
    expect(initialAgenda.filter((item) => matchesChild(item, "alex"))).toHaveLength(2);
  });
  it("rejects invalid dates, titles and times without inventing a time", () => {
    const valid = { title: "Trip", date: "2026-11-04", time: "", location: "" };
    expect(eventDetailsSchema.parse(valid)).toEqual(valid);
    for (const invalid of [{ date: "2026-02-30" }, { title: "  " }, { time: "24:01" }, { time: "9:30" }]) {
      expect(eventDetailsSchema.safeParse({ ...valid, ...invalid }).success).toBe(false);
    }
  });
});
