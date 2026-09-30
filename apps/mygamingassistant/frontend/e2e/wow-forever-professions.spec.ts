/**
 * WoW Forever Cooking & Fishing guide — static, frontend-only page.
 *
 * Run: npm run test:e2e -- wow-forever-professions
 */
import { test, expect } from "@playwright/test";

test("reaches the page from the landing card and leads with training", async ({ page }) => {
  await page.goto("/wow-forever");
  await page.getByRole("link", { name: /Cooking & Fishing/ }).click();
  await expect(page).toHaveURL(/\/wow-forever\/professions$/);
  await expect(page.getByRole("radio", { name: "Cooking" })).toBeChecked();
  await expect(page.getByRole("heading", { name: /train it first/i })).toBeVisible();
  await expect(page.getByText("Stephen Ryback")).toBeVisible();
});

test("switches to Fishing and Horde, and the route follows", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("radio", { name: "Fishing" }).click();
  await expect(page).toHaveURL(/\?p=fishing$/);
  await page.getByRole("radio", { name: "Horde" }).click();
  await expect(page.getByText("Lumak")).toBeVisible();
  await expect(page.getByText("Arnold Leland")).toHaveCount(0);

  const route = page.locator("#route");
  await expect(route.getByText("Durotar, Mulgore or Tirisfal Glades lakes and rivers")).toBeVisible();
  await expect(route.getByText("Artisan quest: Nat Pagle, Angler Extreme")).toBeVisible();
});

test("jump links scroll to each section", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("link", { name: "Leveling route" }).click();
  await expect(page).toHaveURL(/#route$/);
  await expect(page.locator("#route").getByText("Spiced Wolf Meat")).toBeInViewport();
});

test("the phone layout never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/professions");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
