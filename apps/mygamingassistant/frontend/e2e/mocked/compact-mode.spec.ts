/**
 * Compact mode (?compact=1): the page with no shell, for a second-monitor window.
 *
 * body is overflow:hidden and #root is 100% tall, so with the shell gone the
 * compact frame's own <main> is what scrolls. It is also the page's one main
 * landmark: pages render a <div> root, never a <main> of their own.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts compact-mode
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

// Any API call this spec does not stub answers 404, so nothing reaches a backend.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("a tall page scrolls inside the compact frame, its one main landmark, with no shell", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/wow-forever/macros?compact=1");
  await expect(page.getByRole("heading", { name: "Macros", level: 1 })).toBeVisible();

  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  await expect(page.locator("main")).toHaveCount(1);

  const main = page.getByRole("main");
  const frame = await main.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(frame.scrollHeight).toBeGreaterThan(frame.clientHeight);

  // The foot of the page is reachable: the frame scrolls, not the window.
  const notice = page.getByTestId("wow-legal-notice");
  await notice.scrollIntoViewIfNeeded();
  await expect(notice).toBeInViewport();
  expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("the web build's live-mode placeholder renders in the compact frame", async ({ page }) => {
  await page.goto("/live/cs2?compact=1");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Live mode is a desktop feature", level: 1 })).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
});
