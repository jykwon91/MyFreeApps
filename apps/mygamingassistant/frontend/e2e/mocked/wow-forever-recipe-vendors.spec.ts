/**
 * WoW Forever Professions — where to buy each recipe: the "Recipe vendors" section and the
 * "Buy … from …" lines on route rows, with Directions on the World Map.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-recipe-vendors
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubEmptyPrices } from "./fixtures/emptyPrices";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

// No auction prices here — the vendor list doesn't need them.
// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test.beforeEach(async ({ page }) => {
  await stubEmptyPrices(page);
});

test("Cooking lists recipe vendors for your faction, and Directions opens the World Map", async ({ page }) => {
  await page.goto("/wow-forever/professions?p=cooking");
  await page.getByRole("radio", { name: "Horde" }).click();

  // The Expert Cookbook milestone names the Horde vendor who sells it.
  const route = page.locator("#route");
  await expect(route.getByTestId("recipe-buy-line").filter({ hasText: "Expert Cookbook" }).first()).toContainText("Wulan");

  const vendors = page.locator("#vendors");
  await expect(vendors.getByRole("heading", { name: "Recipe vendors" })).toBeVisible();
  await expect(vendors.getByText("Classic data").first()).toBeVisible();
  const card = vendors.getByTestId("recipe-vendor").first();
  await expect(card).toBeVisible();
  await expect(vendors.getByTestId("recipe-vendor").filter({ hasText: "Shandrina" })).toHaveCount(0);

  // The Alliance vendors wait behind a toggle.
  await vendors.getByRole("button", { name: /^Show \d+ Alliance vendors?$/ }).click();
  await expect(vendors.getByTestId("recipe-vendor").filter({ hasText: "Shandrina" })).toBeVisible();

  const directions = card.getByRole("link", { name: /^Directions to / });
  await expect(directions).toHaveAttribute("href", /^\/wow-forever\/map\?to=pt%3A\d+%2C[\d.]+%2C[\d.]+&dir=1$/);
  await directions.click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?to=pt%3A\d+/);
});

test("a crafting guide lists its recipe vendors and links each to the World Map", async ({ page }) => {
  await page.goto("/wow-forever/professions?p=tailoring");
  const vendors = page.locator("#vendors");
  await expect(vendors.getByRole("heading", { name: "Recipe vendors" })).toBeVisible();
  const card = vendors.getByTestId("recipe-vendor").first();
  await expect(card.getByTestId("vendor-offer").first()).toBeAttached();

  const directions = card.getByRole("link", { name: /^Directions to / });
  await expect(directions).toHaveAttribute("href", /^\/wow-forever\/map\?to=pt%3A/);
  await directions.click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?to=pt%3A\d+/);
});

test("the vendor list never scrolls sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const p of ["cooking", "tailoring"]) {
    await page.goto(`/wow-forever/professions?p=${p}`);
    await expect(page.locator("#vendors").getByTestId("recipe-vendor").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, p).toBeLessThanOrEqual(0);
  }
});
