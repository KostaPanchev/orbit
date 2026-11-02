import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function tabTo(page: Page, target: Locator) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

test("primary review workflow works with the keyboard alone", async ({ page }) => {
  await page.goto("/review");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await tabTo(page, page.getByRole("article", { name: "Trip permission deadline", exact: true }).getByRole("button", { name: "Approve", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Waiting for you 3" })).toBeFocused();
  await tabTo(page, page.getByRole("article", { name: "Visit to the nature centre", exact: true }).getByRole("button", { name: "Edit & approve" }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByLabel("Title", { exact: true }));
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Keyboard trip");
  await tabTo(page, page.getByRole("button", { name: "Approve & add to demo" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Waiting for you 2" })).toBeFocused();
  await tabTo(page, page.getByRole("article", { name: "Lantern walk", exact: true }).getByRole("button", { name: "Dismiss" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Waiting for you 1" })).toBeFocused();
  await tabTo(page, page.getByRole("link", { name: "Upcoming", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article", { name: "Keyboard trip", exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "Lantern walk + raincoats", exact: true })).toContainText("Thu, 12 November");
});

test("approvals, edits and dismissals survive navigation, but not a reload", async ({ page }) => {
  await page.goto("/review");
  await page.getByRole("article", { name: "Trip permission deadline", exact: true }).getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Waiting for you 3" })).toBeFocused();
  await page.getByRole("article", { name: "Visit to the nature centre", exact: true }).getByRole("button", { name: "Edit & approve" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Nature trip - bring lunch");
  await expect(page.getByLabel("Time (optional)")).toHaveValue("");
  await page.getByRole("button", { name: "Approve & add to demo" }).click();
  await page.getByRole("article", { name: "Autumn gathering", exact: true }).getByRole("button", { name: "Dismiss" }).click();
  await page.getByRole("link", { name: "Upcoming", exact: true }).click();
  await expect(page.getByRole("article", { name: "Trip permission deadline", exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "Nature trip - bring lunch", exact: true })).toContainText("Date only");
  await page.getByRole("link", { name: /^Review/ }).click();
  await expect(page.getByRole("article", { name: "Autumn gathering", exact: true })).toContainText("Dismissed from review");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Waiting for you 4" })).toBeVisible();
  await page.getByRole("link", { name: "Upcoming", exact: true }).click();
  await expect(page.getByRole("article", { name: "Nature trip - bring lunch", exact: true })).toHaveCount(0);
});

test("revision approval replaces one entry and keeps the user's edited title", async ({ page }) => {
  await page.goto("/upcoming");
  await expect(page.getByRole("article", { name: "Lantern walk + raincoats", exact: true })).toContainText("Thu, 12 November");
  await page.getByRole("link", { name: /^Review/ }).click();
  const revision = page.getByRole("article", { name: "Lantern walk", exact: true });
  await expect(revision).toContainText("Your existing entry stays unchanged");
  await revision.getByRole("button", { name: "Approve revision" }).click();
  await revision.getByRole("link", { name: "View agenda entry" }).click();
  const entry = page.getByRole("article", { name: "Lantern walk + raincoats", exact: true });
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText("Fri, 13 November");
  await expect(entry).toContainText("16:30");
  await expect(page.getByRole("article")).toHaveCount(4);
});

test("unresolved dates cannot be scheduled without explicit confirmation", async ({ page }) => {
  await page.goto("/review");
  const item = page.getByRole("article", { name: "Autumn gathering", exact: true });
  await expect(item.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  await item.getByRole("button", { name: "Resolve & approve" }).click();
  await expect(page.getByLabel("Confirmed date")).toHaveValue("");
  await page.getByRole("button", { name: "Approve & add to demo" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Confirmed date").fill("2026-11-20");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve & add to demo" }).click();
  await page.getByRole("link", { name: "Upcoming", exact: true }).click();
  await expect(page.getByRole("article", { name: "Autumn gathering", exact: true })).toContainText("Fri, 20 November");
});

test("child filter persists and reset restores all original fixtures", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "Alex", exact: true }).check();
  await expect(page.getByRole("status")).toHaveText("Showing Alex.");
  await expect(page.getByRole("heading", { name: "A quick reply before the trip" })).toHaveCount(0);
  await page.getByRole("link", { name: "Upcoming", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Alex", exact: true })).toBeChecked();
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByRole("link", { name: /^Review/ }).click();
  await page.getByRole("article", { name: "Autumn gathering", exact: true }).getByRole("button", { name: "Dismiss" }).click();
  await page.getByLabel("Demo scenario").selectOption("busy");
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByRole("radio", { name: "Both children" })).toBeChecked();
  await expect(page.getByLabel("Demo scenario")).toHaveValue("normal");
  await expect(page.getByRole("heading", { name: "Waiting for you 4" })).toBeVisible();
});

test("source drawer is keyboard accessible and restores focus", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "View source: 2B visits the nature centre" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close dialog" })).toBeFocused();
  await expect(page.getByRole("dialog").locator('[lang="da"]')).toContainText("Onsdag den 4. november");
  await expect(page.getByRole("dialog")).toContainText("Attachment not processed");
  await page.keyboard.press("Shift+Tab");
  // Native dialogs may move focus to browser chrome, but never to the inert page.
  expect(await page.evaluate(() => document.activeElement === document.body || document.querySelector("dialog")?.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close dialog" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("all scenarios are distinct; failed checks preserve data and original timestamps", async ({ page }) => {
  await page.goto("/");
  const cases = [
    ["busy", "A little more happening today"],
    ["empty", "No items in the checked demo sources"],
    ["loading", "Simulating a refresh"],
    ["partial", "Some information could be missing"],
    ["stale", "This overview may be out of date"],
    ["error", "The demo refresh did not complete"],
    ["disconnected", "Demo connection is disconnected"],
    ["reconnect", "Demo session needs reconnecting"],
    ["ai-unavailable", "Demo summary processing is unavailable"],
    ["normal", "Your demo is up to date"],
  ];
  for (const [scenario, title] of cases) {
    await page.getByLabel("Demo scenario").selectOption(scenario);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByText("Last successful demo refresh: 2 Nov, 07:30")).toBeVisible();
    if (scenario === "empty") await expect(page.getByRole("heading", { name: "A quieter demo day" })).toBeVisible();
    else if (scenario === "loading") await expect(page.getByRole("region", { name: "Loading demo" })).toHaveAttribute("aria-busy", "true");
    else await expect(page.getByRole("heading", { name: "A quick reply before the trip" })).toBeVisible();
  }
  await page.getByLabel("Demo scenario").selectOption("partial");
  await page.getByRole("link", { name: "Demo settings" }).click();
  await expect(page.getByText("Incomplete · previous data", { exact: true })).toBeVisible();
  await expect(page.getByText("Inaccessible · not checked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simulate refresh" }).click();
  await expect(page.getByRole("button", { name: "Simulating..." })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Demo refresh simulation finished.");
  await expect(page.getByLabel("Demo scenario")).toHaveValue("partial");
});

test("core pages, source dialog and editor pass automated WCAG AA checks", async ({ page }) => {
  for (const route of ["/", "/upcoming", "/review", "/settings"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toHaveCount(1);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(result.violations).toEqual([]);
  }
  await page.goto("/review");
  await page.getByRole("article", { name: "Visit to the nature centre", exact: true }).getByRole("button", { name: "Edit & approve" }).click();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "View source: 2B visits the nature centre" }).click();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
});

test("320px reflow and 200% zoom retain the primary workflows", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const route of ["/", "/upcoming", "/review", "/settings"]) {
    await page.goto(route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/review");
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("article", { name: "Visit to the nature centre", exact: true }).getByRole("button", { name: "Edit & approve" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Zoom-tested trip");
  await page.getByRole("button", { name: "Approve & add to demo" }).click();
  await page.getByRole("link", { name: "Upcoming", exact: true }).click();
  await expect(page.getByRole("article", { name: "Zoom-tested trip", exact: true })).toBeVisible();
});

test("the browser makes no external service requests or storage writes", async ({ page }) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:3100/")) external.push(request.url());
  });
  await page.goto("/review");
  await page.getByRole("article", { name: "Trip permission deadline", exact: true }).getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Simulate refresh" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo refresh simulation finished." })).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie }))).toEqual({ local: 0, session: 0, cookies: "" });
});
