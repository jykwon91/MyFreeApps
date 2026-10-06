/**
 * WoW Forever "Making gold" guide — static, frontend-only page.
 *
 * Run: npm run test:e2e -- wow-forever-gold
 */
import { test, expect } from "@playwright/test";

// Most checks pick levels past the beta cap of 30, so they run after launch.
const AFTER_LAUNCH = new Date("2026-11-05T12:00:00Z");
const IN_BETA = new Date("2026-10-05T12:00:00Z");

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(AFTER_LAUNCH);
});

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

test("in the beta, your level stops at 30", async ({ page }) => {
  await page.clock.setFixedTime(IN_BETA);
  await page.goto("/wow-forever/gold");
  const level = page.getByRole("spinbutton", { name: "Your level" });
  await level.fill("45");
  await expect(page.getByText("The beta stops at level 30 — 60 from launch on Nov 4.")).toBeVisible();
  await page.reload();
  await expect(level).toHaveValue("30");
});
