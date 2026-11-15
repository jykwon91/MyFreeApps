/**
 * WoW Forever Goal planner — profession and recipe goals worked into one ordered route.
 * Frontend-only: the crafting, World Map and recipe data are bundled; prices answer "none yet".
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-goal-planner
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";
import { stubEmptyPrices } from "./fixtures/emptyPrices";

const PAGE = "/wow-forever/goal-planner";

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
  await stubEmptyPrices(page);
});

test("adding a profession builds the route, with Route there links and a shopping list", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { name: "Goal planner" })).toBeVisible();
  await expect(page.getByText("Add a profession or a recipe above and the route shows up here.")).toBeVisible();

  await page.getByTestId("add-profession-tailoring").click();
  await expect(page).toHaveURL(/[?&]g=tailoring\.0\.300/);
  await expect(page.getByTestId("goal-tailoring")).toBeVisible();

  const stops = page.getByTestId("plan-stop");
  await expect(stops.first()).toBeVisible();
  const titles = await page.getByTestId("plan-stop-title").allTextContents();
  expect(titles).toContain("Buy materials at the auction house");
  expect(titles.some((t) => /Tailoring/.test(t))).toBe(true);
  expect(titles.some((t) => /Artisan Tailoring/.test(t))).toBe(true);

  // The first stop routes from your location; every later one from the stop before.
  const first = new URL((await page.getByTestId("plan-stop-route").first().getAttribute("href")) ?? "", "http://x.test");
  expect(first.pathname).toBe("/wow-forever/map");
  expect(first.searchParams.get("to")).toBeTruthy();
  expect(first.searchParams.has("from")).toBe(false);
  expect(first.searchParams.get("dir")).toBe("1");
  const second = new URL((await page.getByTestId("plan-stop-route").nth(1).getAttribute("href")) ?? "", "http://x.test");
  expect(second.searchParams.get("from")).toBe(first.searchParams.get("to"));

  await expect(page.getByTestId("plan-shopping")).toBeVisible();
  await expect(page.getByTestId("plan-shopping-row").filter({ hasText: "Linen Cloth" }).first()).toBeVisible();
  await expect(page.getByTestId("plan-crafts")).not.toHaveText(/^\s*$/);

  // Following Route there opens the World Map trip.
  await page.getByTestId("plan-stop-route").first().click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?.*to=/);
});

test("two professions share one plan, and a wanted recipe gets its own stop", async ({ page }) => {
  await page.goto(`${PAGE}?g=tailoring.0.150~cooking.0.150`);
  await expect(page.getByTestId("goal-tailoring")).toBeVisible();
  await expect(page.getByTestId("goal-cooking")).toBeVisible();
  await expect(page.getByTestId("plan-stop").first()).toBeVisible();
  const titles = await page.getByTestId("plan-stop-title").allTextContents();
  expect(titles.some((t) => /Tailoring/.test(t))).toBe(true);
  expect(titles.some((t) => /Cooking/.test(t))).toBe(true);

  await page.getByTestId("recipe-goal-search").fill("Red Woolen Bag");
  await page.getByTestId("recipe-goal-result").filter({ hasText: "Red Woolen Bag" }).first().click();
  await expect(page.getByTestId("recipe-goal-chip").filter({ hasText: "Red Woolen Bag" })).toBeVisible();
  await expect(page).toHaveURL(/[?&]r=tailoring%3A6688|[?&]r=tailoring:6688/);
  await expect(page.getByTestId("plan-stop-title").filter({ hasText: "Pattern: Red Woolen Bag" })).toBeVisible();

  // Removing a goal takes it off the plan.
  await page.getByRole("button", { name: "Remove Cooking" }).click();
  await expect(page.getByTestId("goal-cooking")).toHaveCount(0);
  await expect(page).not.toHaveURL(/cooking\.0\.150/);
});

test("the goals come back on a later visit without the link", async ({ page }) => {
  await page.goto(PAGE);
  await page.getByTestId("add-profession-enchanting").click();
  await expect(page.getByTestId("goal-enchanting")).toBeVisible();
  await page.goto(PAGE);
  await expect(page.getByTestId("goal-enchanting")).toBeVisible();
  await expect(page.getByTestId("plan-stop").first()).toBeVisible();
});

test("shows a skeleton shaped like the plan while the map data loads", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/worldMap\/zones\.json/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`${PAGE}?g=tailoring.0.75`);
  const skeleton = page.getByTestId("goal-plan-skeleton");
  await expect(skeleton).toBeVisible();
  release();
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByTestId("plan-summary")).toBeVisible();
  await expect(page.getByTestId("plan-summary").getByTestId(/^plan-(gold|travel|crafts)$/)).toHaveCount(3);
});

test("works on a phone: touch-sized controls and no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`${PAGE}?g=tailoring.0.150`);
  await expect(page.getByTestId("plan-stop").first()).toBeVisible();
  const route = await page.getByTestId("plan-stop-route").first().boundingBox();
  expect(route?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  const add = await page.getByTestId("add-profession-enchanting").boundingBox();
  expect(add?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
