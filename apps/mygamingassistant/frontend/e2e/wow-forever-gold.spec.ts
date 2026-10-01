/**
 * WoW Forever "Making gold" guide — static, frontend-only page.
 *
 * Run: npm run test:e2e -- wow-forever-gold
 */
import { test, expect } from "@playwright/test";

test("reaches the page from the landing card", async ({ page }) => {
  await page.goto("/wow-forever");
  await page.getByRole("link", { name: /^Making gold/ }).click();
  await expect(page).toHaveURL(/\/wow-forever\/gold$/);
  await expect(page.getByRole("heading", { name: "Making gold" })).toBeVisible();
  await expect(page.getByText(/No prices here/)).toBeVisible();
});

test("the level toggle changes the tips and is kept in the URL", async ({ page }) => {
  await page.goto("/wow-forever/gold");
  const now = page.locator("#now");
  await expect(now.getByText("Take two gathering professions")).toBeVisible();
  await page.getByRole("radio", { name: "40–60" }).click();
  await expect(page).toHaveURL(/band=40-60/);
  await expect(now.getByText("Farm high-end materials")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: "40–60" })).toBeChecked();
});

test("class tips switch to every class", async ({ page }) => {
  await page.goto("/wow-forever/gold");
  await page.getByLabel("Class", { exact: true }).selectOption("all");
  await expect(page.locator("#class").getByRole("heading", { name: "Rogue" })).toBeVisible();
});

test("the phone layout never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/gold?band=all");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
