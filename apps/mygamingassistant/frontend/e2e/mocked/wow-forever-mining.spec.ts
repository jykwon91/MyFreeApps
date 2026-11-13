/**
 * WoW Forever Mining guide (`/wow-forever/professions?p=mining`) — static, frontend-only.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-mining
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("picks Mining from the Gathering group and walks a skill from 1 to the Journeyman cap", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("radio", { name: "Mining" }).click();
  await expect(page).toHaveURL(/\?p=mining$/);
  await expect(page.getByRole("heading", { name: "What can I mine right now?" })).toBeVisible();

  const now = page.getByTestId("gather-now");
  await expect(now.getByText("Copper Vein")).toBeVisible();
  await expect(now).toContainText("Next unlock: Tin at 65");
  await expect(page.getByRole("list", { name: "Where to go" }).getByRole("link", { name: /Directions/ }).first()).toBeVisible();

  const skill = page.getByRole("spinbutton", { name: "Your skill" });
  await skill.fill("75");
  const banner = page.getByTestId("capped-banner");
  await expect(banner).toContainText("You're capped at 75.");
  await expect(banner).toContainText("Train Journeyman at Gelman Stonehand");

  await page.reload();
  await expect(page.getByRole("spinbutton", { name: "Your skill" })).toHaveValue("75");
});

test("Horde at a high skill gets Thorium, Horde trainers and no sideways scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/professions?p=mining&skill=150");
  await page.getByRole("radio", { name: "Horde" }).click();
  await expect(page.getByTestId("capped-banner")).toContainText("Train Expert at Makaru");

  await page.goto("/wow-forever/professions?p=mining&skill=260");
  await expect(page.getByTestId("gather-now")).toContainText("Small Thorium Vein");
  await page.getByText("Every ore and its skill").click();
  await expect(page.getByTestId("node-table")).toContainText("Rich Thorium Vein");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
