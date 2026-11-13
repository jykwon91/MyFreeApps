/**
 * WoW Forever — New Player Guide removed.
 *
 * /wow-forever/guide redirects to /wow-forever and the hub no longer shows
 * a "New Player Guide" tile.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-guide-redirect
 */
import { test, expect } from "@playwright/test";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("/wow-forever/guide redirects to /wow-forever", async ({ page }) => {
  await page.goto("/wow-forever/guide");
  await expect(page).toHaveURL(/\/wow-forever$/);
  await expect(page.getByRole("heading", { name: "World of Warcraft: Forever", level: 1 })).toBeVisible();
});

test("the hub no longer shows a New Player Guide tile", async ({ page }) => {
  await page.goto("/wow-forever");
  await expect(page.getByRole("link", { name: /^Macros/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /New Player Guide/ })).toHaveCount(0);
});
