/**
 * WoW Forever Legacy planner. A test creates its plan through the UI by clicking
 * talents, and that plan is kept in the URL. It then drives the player flow:
 * spend points, hit a gate, hit the 16-point cap, copy the share link and reopen
 * it, then Reset. Challenge ticks are saved in localStorage, and "Clear ticks"
 * removes them again. The trees themselves come from the committed game data.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-legacy
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { LEGACY_CHALLENGES as TOTAL_CHALLENGES } from "./fixtures/wowForeverDataCounts";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";

const LEGACY = "/wow-forever/legacy";
const CHECKLIST_KEY = "mga.wowForever.legacy.checklist.v1";
/** Node ids from the committed legacy.json. */
const WORKING_OVERTIME = 110290; // Professions, 5 ranks, open
const BOUNTIFUL_HARVEST = 110291; // Professions, 5 ranks, open
const MASTER_CHEF = 110289; // Professions, 5 ranks, 5-point gate
const WELL_RESTED = 110301; // Adventure, 5 ranks, open
const THRILL = 110296; // Adventure, 5 ranks, open
const REINFORCE = 110318; // Resourcefulness, 5 ranks, open
const DEDICATED_STUDY = 110284; // Professions, 1 rank, 10-point gate

function node(page: Page, id: number) {
  return page.getByTestId(`legacy-node-${id}`);
}

async function addPoints(page: Page, id: number, times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) await node(page, id).click();
}

function storedTicks(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), CHECKLIST_KEY);
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test.afterEach(async ({ page }) => {
  // Nothing a test created may outlive it.
  if (page.url().includes(LEGACY)) expect(await storedTicks(page)).toBeNull();
});

test("spend points, hit a gate and the cap, share the plan, then reset", async ({ page, context }) => {
  await page.goto(LEGACY);
  await expect(page.getByRole("heading", { name: "Legacy planner" })).toBeVisible();
  await expect(page.getByTestId("legacy-points-left")).toHaveText("16 points left");

  // The 5-point gate: Master Chef is locked until 5 points are in Professions.
  await addPoints(page, WORKING_OVERTIME, 3);
  await expect(node(page, WORKING_OVERTIME)).toHaveAttribute("data-rank", "3");
  await node(page, MASTER_CHEF).click();
  await expect(node(page, MASTER_CHEF)).toHaveAttribute("data-rank", "0");
  await expect(page.getByTestId("legacy-block")).toHaveText("Spend 5 points in Professions to unlock (2 more).");
  await addPoints(page, WORKING_OVERTIME, 2);
  await node(page, MASTER_CHEF).click();
  await expect(node(page, MASTER_CHEF)).toHaveAttribute("data-rank", "1");
  await expect(page).toHaveURL(/[?&]b=1-501--(&|$)/);

  // Right-click takes the point back out. A point a gated talent needs can't come out.
  await node(page, MASTER_CHEF).click({ button: "right" });
  await expect(node(page, MASTER_CHEF)).toHaveAttribute("data-rank", "0");
  await node(page, MASTER_CHEF).click();
  await node(page, WORKING_OVERTIME).click({ button: "right" });
  await expect(node(page, WORKING_OVERTIME)).toHaveAttribute("data-rank", "5");
  await node(page, MASTER_CHEF).click({ button: "right" });

  // The 16-point cap.
  await addPoints(page, BOUNTIFUL_HARVEST, 5);
  await addPoints(page, WELL_RESTED, 5);
  await addPoints(page, REINFORCE, 1);
  await expect(page.getByTestId("legacy-points-spent")).toHaveText("16 / 16 spent");
  await expect(page.getByTestId("legacy-points-left")).toHaveText("0 points left");
  await node(page, THRILL).click();
  await expect(node(page, THRILL)).toHaveAttribute("data-rank", "0");
  await expect(page.getByTestId("legacy-block")).toHaveText("All 16 points are spent.");
  await expect(page).toHaveURL(/[?&]b=1-55-5-001(&|$)/);

  // The share link opens the same plan.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("talent-copy-link").click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain(`${LEGACY}?b=1-55-5-001`);
  await page.goto(new URL(link).pathname + new URL(link).search);
  await expect(node(page, REINFORCE)).toHaveAttribute("data-rank", "1");
  await expect(node(page, WELL_RESTED)).toHaveAttribute("data-rank", "5");
  await expect(page.getByTestId("legacy-points-left")).toHaveText("0 points left");

  // Reset clears the plan and the link.
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("legacy-points-left")).toHaveText("16 points left");
  await expect(node(page, WORKING_OVERTIME)).toHaveAttribute("data-rank", "0");
  await expect(page).not.toHaveURL(/[?&]b=/);
});

test("the 10-point gate opens after 10 points in the tree", async ({ page }) => {
  await page.goto(LEGACY);
  await addPoints(page, WORKING_OVERTIME, 5);
  await addPoints(page, MASTER_CHEF, 4);
  await node(page, DEDICATED_STUDY).click();
  await expect(page.getByTestId("legacy-block")).toHaveText("Spend 10 points in Professions to unlock (1 more).");
  await node(page, MASTER_CHEF).click();
  await node(page, DEDICATED_STUDY).click();
  await expect(node(page, DEDICATED_STUDY)).toHaveAttribute("data-rank", "1");
  await page.getByRole("button", { name: "Reset" }).click();
});

test("a broken plan link starts empty and says so", async ({ page }) => {
  await page.goto(`${LEGACY}?b=1-06--`);
  await expect(page.getByTestId("legacy-broken-link")).toBeVisible();
  await expect(page.getByTestId("legacy-points-left")).toHaveText("16 points left");
});

test("challenge ticks are kept in this browser and cleared again", async ({ page }) => {
  await page.goto(LEGACY);
  await expect(page.getByTestId("legacy-ticked-count")).toHaveText(`0 of ${TOTAL_CHALLENGES} done`);
  await expect(page.getByText(/once for the whole account/)).toBeVisible();
  const firstCategory = page.locator("[data-testid^='legacy-category-']").first();
  await firstCategory.locator("summary").click();
  const box = firstCategory.locator("[data-testid^='legacy-challenge-']").first();
  await box.check();
  await expect(page.getByTestId("legacy-ticked-count")).toHaveText(`1 of ${TOTAL_CHALLENGES} done`);
  expect(await storedTicks(page)).not.toBeNull();

  await page.reload();
  await expect(page.getByTestId("legacy-ticked-count")).toHaveText(`1 of ${TOTAL_CHALLENGES} done`);

  await page.getByRole("button", { name: "Clear ticks" }).click();
  await expect(page.getByTestId("legacy-ticked-count")).toHaveText(`0 of ${TOTAL_CHALLENGES} done`);
  expect(await storedTicks(page)).toBeNull();
});

test("on a phone the trees are tabs with 44px talents", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(LEGACY);
  await expect(page.getByTestId("legacy-tree-Professions")).toBeVisible();
  await expect(page.getByTestId("legacy-tree-Adventure")).toBeHidden();
  await page.getByRole("radio", { name: /Adventure/ }).click();
  await expect(page.getByTestId("legacy-tree-Adventure")).toBeVisible();
  const size = await node(page, WELL_RESTED).boundingBox();
  expect(size?.width ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  expect(size?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
});

test("the skeleton mirrors the loaded page while the data loads", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/data\/legacy\/.*\.json/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(LEGACY);
  await expect(page.getByTestId("legacy-skeleton")).toBeVisible();
  await expect(page.getByTestId("legacy-skeleton-tree")).toHaveCount(3);
  release();
  await expect(page.getByTestId("legacy-skeleton")).toBeHidden();
  await expect(page.locator("[data-testid^='legacy-tree-']:not([data-testid='legacy-tree-spent'])")).toHaveCount(3);
});
