/**
 * WoW Forever dungeon pages — "Before you go": each dungeon quest's line (the
 * quests before it, in order, with giver, zone, coordinates and directions),
 * tick boxes that say where you are in each line and survive a reload, and
 * World Map links marking every quest giver.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-dungeon-before-you-go
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { createGate } from "@platform/ui/test-support/gate";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { QUESTS_DONE_STORAGE_KEY } from "../../src/games/wow-forever/data/dungeons/questProgressConfig";

const DEADMINES = "/wow-forever/dungeons/deadmines";
const DEFIAS_BROTHERHOOD = 166;

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

function section(page: Page): Locator {
  return page.getByRole("region", { name: "Before you go" });
}

/** Red Silk Bandanas and The Defias Brotherhood share the same six quests before them: one line. */
function defiasLine(page: Page): Locator {
  return section(page).getByTestId("quest-line").filter({ hasText: "Red Silk Bandanas · The Defias Brotherhood" });
}

function step(line: Locator, n: number): Locator {
  return line.getByTestId("pickup-row").nth(n - 1);
}

test("a line lists the quests before a dungeon quest in order, with who gives them and where", async ({ page }) => {
  await page.goto(DEADMINES);
  const line = defiasLine(page);
  await expect(line.getByTestId("pickup-row")).toHaveCount(8);
  await expect(step(line, 1)).toContainText("Gryan Stoutmantle");
  await expect(step(line, 1)).toContainText("Westfall · Sentinel Hill · 56.3, 47.5");
  await expect(step(line, 2)).toContainText("Wiley the Black");
  await expect(step(line, 2)).toContainText("Redridge Mountains · Lakeshire");
  await expect(step(line, 4)).toContainText("Master Mathias Shaw");
  // Both dungeon quests end the line.
  await expect(step(line, 7)).toContainText("Dungeon quest");
  await expect(line.locator(`[data-testid="pickup-row"][data-quest-id="${DEFIAS_BROTHERHOOD}"]`)).toContainText("Dungeon quest");
  // Each step has directions and links to its quest page.
  await expect(step(line, 2).getByRole("link", { name: "Directions to Wiley the Black" })).toHaveAttribute("href", /\/wow-forever\/map\?to=/);
  await step(line, 2).getByRole("link", { name: "The Defias Brotherhood" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/quests\/\d+/);
});

test("ticking a step ticks the ones before it, says what's next, and survives a reload", async ({ page }) => {
  await page.goto(DEADMINES);
  const line = defiasLine(page);
  await expect(line.getByTestId("quest-line-status")).toContainText("Not started — step 1 of 8");

  await step(line, 4).getByRole("checkbox").check();
  for (const n of [1, 2, 3, 4]) await expect(step(line, n).getByRole("checkbox")).toBeChecked();
  await expect(step(line, 5).getByRole("checkbox")).not.toBeChecked();
  await expect(line.getByTestId("quest-line-status")).toContainText("Next: step 5 of 8");
  await expect(line.getByTestId("quest-line-status")).toContainText("from Gryan Stoutmantle in Westfall");
  await expect(step(line, 5)).toHaveAttribute("aria-current", "step");

  await page.reload();
  await expect(step(defiasLine(page), 4).getByRole("checkbox")).toBeChecked();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]") as number[], QUESTS_DONE_STORAGE_KEY);
  expect(stored).toHaveLength(4);

  // Unticking a step unticks the ones after it.
  await step(defiasLine(page), 2).getByRole("checkbox").uncheck();
  await expect(step(defiasLine(page), 1).getByRole("checkbox")).toBeChecked();
  for (const n of [2, 3, 4]) await expect(step(defiasLine(page), n).getByRole("checkbox")).not.toBeChecked();

  // The two dungeon quests at the end are side by side: ticking one leaves the other.
  await step(defiasLine(page), 7).getByRole("checkbox").check();
  await expect(step(defiasLine(page), 6).getByRole("checkbox")).toBeChecked();
  await expect(step(defiasLine(page), 8).getByRole("checkbox")).not.toBeChecked();
  await step(defiasLine(page), 8).getByRole("checkbox").check();
  await expect(defiasLine(page).getByTestId("quest-line-status")).toHaveText("All done");

  await section(page).getByRole("button", { name: "Clear my ticks for this dungeon" }).click();
  await expect(defiasLine(page).getByRole("checkbox", { checked: true })).toHaveCount(0);
  await expect(section(page).getByRole("button", { name: "Clear my ticks for this dungeon" })).toHaveCount(0);
});

test("the World Map link marks every quest giver on the continent", async ({ page }) => {
  await page.goto(DEADMINES);
  const all = section(page).getByTestId("pickup-all-map-link");
  await expect(all).toHaveText("Show all 11 quest givers in Eastern Kingdoms on the World Map");
  await all.click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?m=1415/);
  await expect(page.getByRole("region", { name: "Shared with you" })).toContainText("11 marks on Eastern Kingdoms");
  await expect(page.getByTestId("shared-marks-layer").getByRole("img")).toHaveCount(11);
});

test("on a phone the list fits without sideways scrolling and the tick boxes are big enough to tap", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(DEADMINES);
  const line = defiasLine(page);
  await expect(line).toBeVisible();
  const box = await step(line, 1).locator("label").boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("the skeleton has a Before you go block while the data loads, then the real list replaces it", async ({ page }) => {
  const gate = createGate();
  await page.route(/data\/dungeons\/.*\.json/, async (route) => {
    await gate.wait;
    await route.continue();
  });
  await page.goto(DEADMINES);
  await expect(page.getByTestId("dungeon-before-you-go-skeleton")).toBeVisible();
  gate.release();
  await expect(page.getByTestId("dungeon-before-you-go-skeleton")).toHaveCount(0);
  await expect(defiasLine(page)).toBeVisible();
});
