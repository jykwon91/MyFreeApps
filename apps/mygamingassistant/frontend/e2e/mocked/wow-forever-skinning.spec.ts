/**
 * WoW Forever Skinning guide (`/wow-forever/professions?p=skinning`) — static, frontend-only.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-skinning
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("picks Skinning from the Gathering group and walks a skill to the Journeyman cap", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("radio", { name: "Skinning" }).click();
  await expect(page).toHaveURL(/\?p=skinning$/);
  await expect(page.getByRole("heading", { name: "What can I skin right now?" })).toBeVisible();

  const now = page.getByTestId("skin-now");
  await expect(now).toContainText("skin beasts level");
  await expect(page.getByRole("list", { name: "Where to go" }).getByRole("link", { name: /Directions/ }).first()).toBeVisible();

  const skill = page.getByRole("spinbutton", { name: "Your skill" });
  await skill.fill("75");
  await expect(now).toContainText("Skill 75");
  const banner = page.getByTestId("capped-banner");
  await expect(banner).toContainText("You're capped at 75.");
  await expect(banner).toContainText("Train Journeyman at");

  await page.reload();
  await expect(page.getByRole("spinbutton", { name: "Your skill" })).toHaveValue("75");
});

test("Horde at a high skill gets Horde trainers, the leather table and no sideways scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/professions?p=skinning&skill=150");
  await page.getByRole("radio", { name: "Horde" }).click();
  await expect(page.getByTestId("capped-banner")).toContainText("Train Expert at Thuwd");

  await page.goto("/wow-forever/professions?p=skinning&skill=280");
  await expect(page.getByTestId("skin-now")).toContainText("Skill 280");
  await page.getByText("Leather by beast level").click();
  await expect(page.getByTestId("leather-table")).toContainText("Rugged Leather");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
