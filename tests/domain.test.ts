import { describe, expect, it } from "vitest";
import { initialAgenda } from "@/demo/fixtures";
import { eventDetailsSchema } from "@/domain/model";
import { formatDate, formatSourceTime, inWindow, matchesChild } from "@/domain/presentation";

describe("dates, filtering and validation", () => {
  it.each([
    ["2026-11-01", false], ["2026-11-02", true], ["2026-12-01", true], ["2026-12-02", false],
  ])("includes exactly the 30-day window: %s", (date, included) => {
    expect(inWindow(date as string)).toBe(included);
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
