/**
 * WoW Forever recipe-item tooltip — a Pattern / Plans / Formula the Forever item files
 * haven't shown yet still says what it needs and teaches, then the item it makes.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-recipe-item-tooltip
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("hovering Pattern: Runecloth Boots shows what it teaches and the boots' stats", async ({ page }) => {
  await page.goto("/wow-forever/recipes?q=runecloth+boots");
  const row = page.getByTestId("recipe-row").filter({ hasText: "Runecloth Boots" }).first();
  await row.locator("summary").click();

  await row.getByRole("link", { name: "Pattern: Runecloth Boots" }).first().hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  const recipe = tooltip.getByTestId("recipe-item-tooltip");
  await expect(recipe).toContainText("Pattern: Runecloth Boots");
  await expect(recipe).toContainText("Binds when picked up");
  await expect(recipe).toContainText("Requires Tailoring (235)");
  await expect(recipe).toContainText("Use: Teaches you how to make Runecloth Boots");
  await expect(recipe.getByTestId("item-stats")).toContainText("50 Armor");
  await expect(recipe).toContainText("Reagents: Bolt of Runecloth (4)");
  await expect(tooltip).not.toContainText("No stats for this item");

  // The made item's own tooltip still works.
  await page.mouse.move(0, 0);
  await row.getByRole("link", { name: "Runecloth Boots", exact: true }).first().hover();
  await expect(page.getByRole("tooltip").getByTestId("item-stats")).toContainText("Item Level 56");
});
