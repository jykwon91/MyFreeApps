/**
 * WoW Forever Herbalism guide (`/wow-forever/professions?p=herbalism`) — static, frontend-only.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-herbalism
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("picks Herbalism from the Gathering group and walks a skill from 1 to the Journeyman cap", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("radio", { name: "Herbalism" }).click();
  await expect(page).toHaveURL(/\?p=herbalism$/);
  await expect(page.getByRole("heading", { name: "What can I pick right now?" })).toBeVisible();

  const now = page.getByTestId("gather-now");
  await expect(now.getByText("Peacebloom")).toBeVisible();
  await expect(now).toContainText("Next unlock: Earthroot at 15");
  await expect(page.getByRole("list", { name: "Where to go" }).getByRole("link", { name: /Directions/ }).first()).toBeVisible();
  await expect(page.getByText("/cast Find Herbs")).toBeVisible();

  const skill = page.getByRole("spinbutton", { name: "Your skill" });
  await skill.fill("75");
  const banner = page.getByTestId("capped-banner");
  await expect(banner).toContainText("You're capped at 75.");
  await expect(banner).toContainText("Train Journeyman at Tannysa");

  await page.reload();
  await expect(page.getByRole("spinbutton", { name: "Your skill" })).toHaveValue("75");
});

test("Horde at a high skill gets Golden Sansam, Horde trainers, the Artisan warning and no sideways scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/professions?p=herbalism&skill=150");
  await page.getByRole("radio", { name: "Horde" }).click();
  await expect(page.getByTestId("capped-banner")).toContainText("Train Expert at Jandi");

  await page.goto("/wow-forever/professions?p=herbalism&skill=260");
  await expect(page.getByTestId("gather-now")).toContainText("Golden Sansam");
  await expect(page.getByText("Learn Artisan before Tanaris or Searing Gorge")).toBeVisible();
  await page.getByText("Every herb and its skill").click();
  await expect(page.getByTestId("node-table")).toContainText("Black Lotus");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
