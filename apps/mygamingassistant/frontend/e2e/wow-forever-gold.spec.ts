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
  await expect(page.getByText(/vendor prices from Classic's loot tables/)).toBeVisible();
});

test("your level picks the plan and lists where to farm, with directions", async ({ page }) => {
  await page.goto("/wow-forever/gold");
  await expect(page.locator("#now").getByText("Quest, and loot every mob you kill")).toBeVisible();
  await page.getByRole("spinbutton", { name: "Your level" }).fill("45");
  await expect(page.getByRole("heading", { name: "Your plan for levels 40–60" })).toBeVisible();
  const farm = page.locator("#farm");
  await expect(farm.getByRole("listitem").filter({ hasText: "an hour" }).first()).toBeVisible();
  await farm.getByRole("radio", { name: "Most cloth" }).click();
  await expect(farm.getByText(/Mageweave Cloth/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("spinbutton", { name: "Your level" })).toHaveValue("45");
  await farm.getByRole("link", { name: "Directions on the World Map" }).first().click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?to=.*dir=1/);
});

test("class tips switch to every class", async ({ page }) => {
  await page.goto("/wow-forever/gold");
  await page.getByLabel("Class", { exact: true }).selectOption("all");
  await expect(page.locator("#class").getByRole("heading", { name: "Rogue" })).toBeVisible();
});

test("the phone layout never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/gold");
  await page.getByRole("spinbutton", { name: "Your level" }).fill("58");
  await page.getByLabel("I have Skinning").check();
  await expect(page.locator("#farm").getByRole("link", { name: "Directions on the World Map" }).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
