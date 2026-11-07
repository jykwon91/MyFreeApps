/**
 * WoW Forever — New Player Guide removed.
 *
 * /wow-forever/guide redirects to /wow-forever and the hub no longer shows
 * a "New Player Guide" tile.
 *
 * Run: npm run test:e2e -- wow-forever-guide-redirect
 */
import { test, expect } from "@playwright/test";

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
