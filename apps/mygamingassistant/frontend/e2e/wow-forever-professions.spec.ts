/**
 * WoW Forever Professions guide (Cooking, Fishing, Tailoring, Enchanting) — static, frontend-only page.
 *
 * Run: npm run test:e2e -- wow-forever-professions
 */
import { test, expect } from "@playwright/test";

test("reaches the page from the landing card and leads with training", async ({ page }) => {
  await page.goto("/wow-forever");
  await page.getByRole("link", { name: /^Professions/ }).click();
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

test("Tailoring shows the route for your skill and a shopping list", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("radio", { name: "Tailoring" }).click();
  await expect(page).toHaveURL(/\?p=tailoring$/);
  await expect(page.getByLabel("Get started: train it first").getByText("Georgio Bolero")).toBeVisible();

  const route = page.locator("#route");
  await route.getByLabel("Your skill").fill("120");
  await expect(page).toHaveURL(/skill=120/);
  await expect(route.locator('[aria-current="step"]')).toBeVisible();
  await expect(route.getByText("You are here")).toBeVisible();

  const shopping = page.locator("#shopping");
  await shopping.locator("summary").first().click();
  await expect(shopping.getByRole("button", { name: /Copy list/ })).toBeVisible();

  // Each material opens to where to get it.
  const fineThread = shopping.locator('details[data-mat="2321"]');
  await expect(fineThread.getByText("Sold in most towns")).toBeVisible();
  await fineThread.locator("summary").click();
  await expect(fineThread.getByText("Sold by")).toBeVisible();
});

test("Enchanting sends you to Uldaman for Artisan", async ({ page }) => {
  await page.goto("/wow-forever/professions?p=enchanting");
  const route = page.locator("#route");
  await expect(route.getByText("Annora")).toBeVisible();
  await expect(route.getByRole("link", { name: /Uldaman/ }).first()).toHaveAttribute("href", /npc=classic-i-286/);
});

test("Enchanting says when to disenchant and when to sell", async ({ page }) => {
  await page.goto("/wow-forever/professions?p=enchanting");
  await page.getByRole("link", { name: "Disenchant or sell?" }).click();
  await expect(page).toHaveURL(/#disenchant$/);
  const rules = page.locator("#disenchant");
  await expect(rules.locator('[data-rule="blue"]').getByText("Check the price first")).toBeInViewport();
  await expect(rules.locator('[data-rule="gray-white"]').getByText("Vendor it")).toBeVisible();
});

test("the crafting guides never scroll sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const p of ["tailoring", "enchanting"]) {
    await page.goto(`/wow-forever/professions?p=${p}&skill=150`);
    await expect(page.locator("#route").getByText("You are here")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, p).toBeLessThanOrEqual(0);
  }
});

test("your level is kept, so material drops are ranked for it", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00Z"));
  await page.goto("/wow-forever/professions?p=tailoring");
  const level = page.getByRole("spinbutton", { name: "Your level" });
  await level.fill("20");
  await expect(page.getByText("The beta stops at level 30 — 60 from launch on Nov 4.")).toBeVisible();
  await page.reload();
  await expect(level).toHaveValue("20");
});
