import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fictionalLiveSnapshot, fictionalScheduleSnapshot, fictionalLessonSnapshot } from "../live-fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/organizer", (route) => route.fulfill({ json: fictionalLiveSnapshot() }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your Aula, at a glance." })).toBeVisible();
});

test("shows real-mode source previews, dynamic audiences and calendar facts without demo briefs", async ({ page }) => {
  await expect(page.getByText("Local organizer · Real Aula data")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Fictional pupil", exact: true })).toBeVisible();
  await expect(page.getByText("Prewritten demo", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Fictional school notice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fictional calendar visit" })).toBeVisible();
  await page.getByRole("button", { name: "View source: Fictional school notice" }).click();
  await expect(page.getByRole("dialog")).toContainText("Original Aula source");
  await expect(page.getByRole("dialog")).toContainText("Attachment not processed");
  await expect(page.getByRole("dialog")).not.toContainText("FICTIONAL_SECRET");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "View source: Fictional message thread" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: /Fictional sender/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("keeps live settings and deletion confirmation explicit and accessible", async ({ page }) => {
  await page.getByRole("link", { name: "Local settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your data stays local" })).toBeVisible();
  await page.getByRole("button", { name: "Delete imported Aula data" }).click();
  await expect(page.getByRole("dialog")).toContainText("cannot be undone");
  await expect(page.getByRole("dialog")).toContainText("saved login are kept");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete imported Aula data" })).toBeFocused();
});

test("supports narrow layout, 200 percent zoom and the AI-disabled review view", async ({ page }) => {
  const longName = `Fictional${"LongAudienceName".repeat(20)}`;
  const state = fictionalLiveSnapshot();
  state.household["aula-10"].name = longName;
  await page.route("**/api/organizer", (route) => route.fulfill({ json: state }));
  await expect(page.getByRole("radio", { name: longName, exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });
  await page.getByRole("link", { name: "Review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Suggestions are not enabled" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("separates Overview, empty Upcoming and the weekly School schedule", async ({ page }) => {
  const state = fictionalScheduleSnapshot();
  await page.route("**/api/organizer", (route) => route.fulfill({ json: state }));
  await expect(page).toHaveTitle("Overview · Orbit");
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link")).toHaveText(["Overview", "Upcoming", "School schedule", "Review", "Local settings"]);
  await expect(page.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Upcoming", exact: true }).click();
  await expect(page).toHaveTitle("Upcoming · Orbit");
  await expect(page.getByRole("heading", { name: "No upcoming events yet" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "School schedule", exact: true }).click();
  await expect(page).toHaveTitle("School schedule · Orbit");
  await expect(page.getByRole("link", { name: "School schedule", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("article", { name: "Fictional kindergarten weekend" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Fictional two-day event" })).toHaveCount(2);
  await expect(page.getByRole("article", { name: "Fictional approved suggestion" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Previous week" })).toBeDisabled();
  const mondayCards = page.getByRole("region", { name: "Mon, 2 November Today" }).getByRole("article");
  await expect(mondayCards).toHaveCount(2);
  await expect(mondayCards.first()).toHaveAccessibleName("Fictional morning class");
  if ((page.viewportSize()?.width ?? 0) > 1180) {
    const columns = await page.locator(".schedule-panel > .schedule-grid > section").evaluateAll((days) => days.map((day) => ({ x: day.getBoundingClientRect().x, y: day.getBoundingClientRect().y })));
    expect(columns).toHaveLength(5);
    expect(new Set(columns.map(({ y }) => y)).size).toBe(1);
    expect(new Set(columns.map(({ x }) => x)).size).toBe(5);
  }
  for (let week = 0; week < 4; week++) await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByRole("button", { name: "Next week" })).toBeDisabled();
  await expect(page.getByRole("article", { name: "Fictional final-window event" })).toBeVisible();
  await expect(page.getByText("Outside the available date window")).toHaveCount(3);
  await page.reload();
  await expect(page.getByRole("article", { name: "Fictional calendar visit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous week" })).toBeDisabled();
});

test("school schedule week controls and source inspection work by keyboard without mutations", async ({ page }) => {
  const mutations: string[] = [];
  page.on("request", (request) => { if (request.method() !== "GET") mutations.push(request.method()); });
  const state = fictionalScheduleSnapshot();
  await page.route("**/api/organizer", (route) => route.fulfill({ json: state }));
  await page.getByRole("link", { name: "School schedule", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article", { name: "Fictional morning class" })).toBeVisible();
  await page.getByRole("button", { name: "This week" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Next week" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Mon, 9 November 2026/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next week" })).toBeFocused();
  const source = page.getByRole("button", { name: "View source: Fictional next-week class", exact: true });
  await page.keyboard.press("Tab");
  await expect(source).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Original Aula source");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(source).toBeFocused();
  await page.getByRole("radio", { name: "Fictional preschooler", exact: true }).check();
  await expect(page.getByRole("heading", { name: /Mon, 9 November 2026/ })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("button", { name: "This week" }).click();
  await expect(page.getByRole("article", { name: "Fictional kindergarten weekend" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Fictional household weekend" })).toBeVisible();
  expect(mutations).toEqual([]);
});

test("school schedule supports long content, 320px reflow, 200 percent zoom and accessible empty states", async ({ page }) => {
  const state = fictionalScheduleSnapshot();
  const longName = `Fictional${"LongAudienceName".repeat(20)}`;
  state.household["aula-10"].name = longName;
  state.agenda[0].title = `Fictional${"LongCalendarTitle".repeat(15)}`;
  await page.route("**/api/organizer", (route) => route.fulfill({ json: state }));
  await page.getByRole("link", { name: "School schedule", exact: true }).click();
  await expect(page.getByRole("radio", { name: longName, exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Next week" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByRole("article", { name: "Fictional next-week class" })).toBeVisible();
  await page.getByRole("button", { name: "This week" }).click();
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });
  state.agenda = [];
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByText("No imported events for this selection", { exact: true })).toHaveCount(5);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
});

test("rejects untrusted hosts on page and API reads", async ({ request }) => {
  expect((await request.get("/api/organizer", { headers: { host: "attacker.invalid" } })).status()).toBe(403);
  expect((await request.get("/", { headers: { host: "attacker.invalid" } })).status()).not.toBe(200);
});

test("EasyIQ lesson content and resource links are readable, accessible and do not load external content", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:3100/")) external.push(request.url()); });
  const state = fictionalLessonSnapshot();
  await page.route("**/api/organizer", (route) => route.fulfill({ json: state }));
  await page.getByRole("link", { name: "School schedule", exact: true }).click();
  const card = page.getByRole("article", { name: "Fictional calendar visit", exact: true });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Læs kapitel 2.");
  await expect(card).toContainText("Medbring en bog.");
  await expect(card).toContainText("Fictional class");
  await expect(card.getByRole("link", { name: /Fictional lesson resource/ })).toHaveAttribute("href", "https://example.invalid/lesson");
  await expect(card.getByRole("link", { name: /Fictional lesson resource/ })).toHaveAttribute("rel", "noopener noreferrer");
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await card.getByRole("button", { name: "View source: Fictional calendar visit" }).click();
  await expect(page.getByRole("dialog")).toContainText("Original EasyIQ SkolePortal source");
  await expect(page.getByRole("dialog")).toContainText("Læs kapitel 2.");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "View source: Fictional calendar visit" })).toBeFocused();
  state.coverage = state.coverage.map((item) => item.kind === "Weekly plan" ? { ...item, complete: false, error: "unavailable" } : item);
  await expect(page.getByText(/EasyIQ lesson coverage is incomplete/)).toBeVisible();
  await expect(card).toContainText("Læs kapitel 2.");
  expect(external).toEqual([]);
});
