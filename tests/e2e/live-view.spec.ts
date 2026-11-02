import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fictionalLiveSnapshot } from "../live-fixtures";

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

test("rejects untrusted hosts on page and API reads", async ({ request }) => {
  expect((await request.get("/api/organizer", { headers: { host: "attacker.invalid" } })).status()).toBe(403);
  expect((await request.get("/", { headers: { host: "attacker.invalid" } })).status()).not.toBe(200);
});
