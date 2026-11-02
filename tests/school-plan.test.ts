// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { isoWeek } from "@/domain/dates";
import { lessonContent } from "@/server/aula/lesson-content";
import { normalizeSchoolWeek, SchoolPlanSource, schoolDateTime } from "@/server/aula/school-plan";
import { AulaReadError, type AulaReader } from "@/server/aula/read-client";
import { schoolScheduleEntries } from "@/domain/presentation";
import { fictionalSchoolWeek, liveProfile, fictionalScheduleSnapshot } from "./live-fixtures";

const signal = () => new AbortController().signal;
describe("EasyIQ lesson content", () => {
  it("preserves original text, dates, classes, end times and safe resource links", () => {
    const record = normalizeSchoolWeek(fictionalSchoolWeek(), liveProfile, 10, "2026-11-02");
    const entry = record.schoolWeek!.entries[0];
    expect(entry).toMatchObject({
      child: "aula-10", title: "Fictional calendar visit", className: "Fictional class",
      date: "2026-11-03", time: "08:00", endDate: "2026-11-03", endTime: "09:00",
      source: { kind: "Weekly plan", author: "EasyIQ SkolePortal", timestamp: "2026-11-03T07:00:00.000Z" },
    });
    expect(entry.notes).toContain("Fictional reading assignment\n\nLæs kapitel 2.");
    expect(entry.notes).toContain("- Medbring en bog.");
    expect(entry.source.links).toEqual([{ url: "https://example.invalid/lesson", label: "Fictional lesson resource" }]);
    expect(entry.source.excerpt).toBe(entry.notes);
    expect(record.retainUntil).toBe("2027-01-30T23:00:00.000Z");
  });
  it("parses HTML without executing it or importing embedded images, scripts or authentication links", () => {
    const value = lessonContent('<p>Read &amp; discuss</p><script>PRIVATE_SCRIPT</script><img src="https://example.invalid/tracker"><iframe>PRIVATE_FRAME</iframe><a href="javascript:alert(1)">Unsafe</a><a href="https://user:PRIVATE_PASSWORD@example.invalid/">Secret</a><a href="https://example.invalid/?loginId=PRIVATE_SESSION">Auth</a><a href="https://example.invalid/resource">Safe &amp; useful</a>');
    expect(value.text).toContain("Read & discuss");
    expect(value.text).not.toContain("PRIVATE");
    expect(value.links).toEqual([{ url: "https://example.invalid/resource", label: "Safe & useful" }]);
    expect(value.omittedLinks).toBe(3);
    expect(lessonContent('<a href="https://example.invalid/#access_token=PRIVATE">Auth</a>').links).toEqual([]);
  });
  it("rejects account mismatches, malformed rows, missing completeness and out-of-week dates", () => {
    const response = fictionalSchoolWeek();
    for (const raw of [
      { ...response, childId: 20 }, { ...response, complete: undefined },
      { ...response, events: [{ ...response.events[0], start: "2026-11-09T08:00:00" }] },
      { ...response, events: [{ ...response.events[0], start: "not-a-date" }] },
      { ...response, events: [{ ...response.events[0], end: "2026/11/03 07:00" }] },
      { ...response, events: [{ ...response.events[0], html: {} }] },
    ]) expect(() => normalizeSchoolWeek(raw, liveProfile, 10, "2026-11-02")).toThrow();
  });
  it("keeps date-only lessons date-only and handles local Copenhagen DST dates explicitly", () => {
    expect(schoolDateTime("2026/11/03")).toEqual({ date: "2026-11-03", time: "" });
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(schoolDateTime("2026-03-29T01:30:00Z")).toMatchObject({ date: "2026-03-29", time: "03:30" });
    const response = fictionalSchoolWeek();
    response.events[0] = { ...response.events[0], start: "2026-03-29T03:30:00.0000000", end: "" };
    expect(normalizeSchoolWeek(response, liveProfile, 10, "2026-03-23").schoolWeek!.entries[0].source.timestamp).toBe("2026-03-29T01:30:00.000Z");
    response.events[0].start = "2026-10-25T02:30:00";
    expect(() => normalizeSchoolWeek(response, liveProfile, 10, "2026-10-19")).toThrow();
  });
  it("replaces only unique exact calendar slot matches in presentation, never title-only matches", () => {
    const calendar = fictionalScheduleSnapshot().agenda;
    const lessons = normalizeSchoolWeek(fictionalSchoolWeek(), liveProfile, 10, "2026-11-02").schoolWeek!.entries;
    const combined = schoolScheduleEntries(calendar, lessons);
    expect(combined.filter((entry) => entry.title === "Fictional calendar visit")).toHaveLength(1);
    expect(combined.find((entry) => entry.title === "Fictional calendar visit")?.location).toBe("Fictional hall");
    expect(calendar).toHaveLength(10);
    expect(schoolScheduleEntries([...calendar, calendar[0]], lessons)).toHaveLength(calendar.length + 2);
    expect(schoolScheduleEntries(calendar, [{ ...lessons[0], time: "09:00" }])).toHaveLength(calendar.length + 1);
    expect(schoolScheduleEntries(calendar, [{ ...lessons[0], child: "aula-20" }])).toHaveLength(calendar.length + 1);
  });
});

describe("bounded weekly provider reads", () => {
  it("requests only this provider and one child/week at a time across the existing window", async () => {
    const read = vi.fn<AulaReader["read"]>(async (_tool, args) => ({ childId: (args.childIds as number[])[0], complete: true, events: [] }));
    const source = new SchoolPlanSource({ read }, liveProfile, "2026-11-02", "2026-12-02");
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await source.page(cursor, signal());
      expect(page.items[0].schoolWeek?.entries).toEqual([]);
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(10);
    expect(read.mock.calls.every(([tool, args]) => tool === "aula.ugeplan.easyiq_skoleportal" && (args.childIds as number[]).length === 1)).toBe(true);
    expect(read.mock.calls[0][1].isoWeek).toBe("2026-W45");
    expect(read.mock.calls[4][1].isoWeek).toBe("2026-W49");
  });
  it("keeps unsupported-child and failed-week coverage incomplete, never an empty success", async () => {
    for (const error of [new AulaReadError("unsupported-source"), new AulaReadError("provider"), new AulaReadError("timeout")]) {
      const read = vi.fn<AulaReader["read"]>().mockRejectedValue(error);
      const page = await new SchoolPlanSource({ read }, liveProfile, "2026-11-02", "2026-12-02").page(null, signal());
      expect(page.items).toEqual([]);
      expect(page.issues).toHaveLength(1);
      expect(page.exclusions).toHaveLength(1);
      expect(page.nextCursor).toBe("1");
    }
  });
  it("discloses missing institution metadata without contacting the provider", async () => {
    const read = vi.fn<AulaReader["read"]>();
    const page = await new SchoolPlanSource({ read }, { ...liveProfile, schools: [] }, "2026-11-02", "2026-12-02").page(null, signal());
    expect(page.issues).toEqual(["incomplete"]);
    expect(read).not.toHaveBeenCalled();
  });
});
