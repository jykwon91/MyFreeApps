/**
 * WoW Forever Professions — where to buy each recipe: the "Recipe vendors" section and the
 * "Buy … from …" lines on route rows, with Directions on the World Map.
 *
 * Run: npm run test:e2e -- wow-forever-recipe-vendors
 */
import { test, expect } from "@playwright/test";

// No auction prices here — the vendor list doesn't need them.
test.beforeEach(async ({ page }) => {
  await page.route("**/wow/prices**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        region: "us",
        credit: { source: "tsm", name: "TradeSkillMaster", url: "https://www.tradeskillmaster.com" },
        source_updated_at: null,
        fetched_at: null,
        columns: ["item_id", "market_value", "avg_sale_price", "historical", "sold_per_day", "name"],
        items: [],
      }),
    }),
  );
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
