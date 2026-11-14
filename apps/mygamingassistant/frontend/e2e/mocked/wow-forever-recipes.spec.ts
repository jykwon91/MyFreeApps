/**
 * WoW Forever Recipes — one search across every profession's recipes: a prompt
 * before any search, name / ingredient search kept in the URL, the profession
 * and "Makes" filters, opening a row for where to learn it, paging, the phone
 * layout and the loading skeleton (same shape as the loaded page).
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-recipes
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";

const RECIPES = "/wow-forever/recipes";
const PAGE_SIZE = 40;

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function heightOf(locator: Locator): Promise<number> {
  return (await locator.boundingBox())?.height ?? 0;
}

/** Which silk ingredient a row's "Uses …" line names, if any. */
function usesKind(text: string): "bolt" | "silk" | "name" {
  if (text.includes("Uses Bolt of Silk Cloth")) return "bolt";
  if (text.includes("Uses Silk Cloth")) return "silk";
  return "name";
}

// No backend in this run: icons answer 404 and show their placeholder.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/wow/icons/**", (route) => route.fulfill({ status: 404, body: "" }));
});

test("asks for a search first, then finds a recipe by name with its ingredients", async ({ page }) => {
  await page.goto(RECIPES);
  await expect(page.getByRole("heading", { level: 1, name: "Recipes" })).toBeVisible();
  await expect(page).toHaveTitle(/Recipes · WoW Forever/);
  await expect(page.getByText(/or pick a profession or category/)).toBeVisible();
  await expect(page.getByTestId("recipe-row")).toHaveCount(0);

  await page.getByLabel("Search recipes").fill("linen bandage");
  await expect(page).toHaveURL(/q=linen\+bandage/);
  const first = page.getByTestId("recipe-row").first();
  await expect(first).toContainText("Linen Bandage");
  await expect(first.getByTestId("recipe-reagents")).toContainText("Linen Cloth");
  await expect(first.getByTestId("recipe-learn-summary")).toContainText("First Aid 1");

  await page.reload();
  await expect(page.getByLabel("Search recipes")).toHaveValue("linen bandage");
  await expect(page.getByTestId("recipe-row").first()).toContainText("Linen Bandage");
});

test("an ingredient finds the recipes that use it, after the ones named for it", async ({ page }) => {
  await page.goto(`${RECIPES}?q=silk+cloth`);
  const rows = page.getByTestId("recipe-row");
  await expect(rows.first()).not.toContainText("Uses Silk Cloth");
  // Recipes that use Silk Cloth itself come before ones that use Bolt of Silk Cloth.
  await expect(rows.filter({ hasText: "Uses Silk Cloth" }).first()).toBeVisible();
  const uses = (await rows.allTextContents()).map(usesKind);
  expect(uses.lastIndexOf("silk")).toBeLessThan(uses.indexOf("bolt"));
  await page.getByLabel("Search recipes").fill("zzzz no such recipe");
  await expect(page.getByText("No recipe matches", { exact: false })).toBeVisible();
});

test("filters by profession and what it makes, kept in the URL, a page at a time", async ({ page }) => {
  await page.goto(RECIPES);
  await page.getByRole("radiogroup", { name: "Profession" }).getByRole("radio", { name: "Tailoring" }).click();
  await expect(page).toHaveURL(/p=tailoring/);
  const rows = page.getByTestId("recipe-row");
  await expect(rows).toHaveCount(PAGE_SIZE);
  await expect(rows.first().getByTestId("recipe-learn-summary")).toContainText("Tailoring");
  await page.getByTestId("recipe-more").click();
  await expect(rows).toHaveCount(PAGE_SIZE * 2);

  await page.getByLabel("Makes").selectOption("bags");
  await expect(page).toHaveURL(/c=bags/);
  await expect.poll(() => rows.count()).toBeLessThan(PAGE_SIZE);
  await expect(rows.filter({ hasText: "Linen Bag" }).first()).toBeVisible();
});

test("opening a recipe shows what it makes, where to learn it and the leveling guide", async ({ page }) => {
  await page.goto(`${RECIPES}?q=linen+bandage`);
  const first = page.getByTestId("recipe-row").first();
  await first.locator("summary").click();
  await expect(first.getByText("Makes", { exact: false }).first()).toBeVisible();
  const guide = first.getByRole("link", { name: "First Aid leveling guide" });
  await expect(guide).toHaveAttribute("href", "/wow-forever/professions?p=firstaid");
  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);
});

test("on a phone the page fits, with touch-sized controls", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`${RECIPES}?q=silk`);
  await expect(page.getByTestId("recipe-row").first()).toBeVisible();
  expect(await noSideways(page)).toBeLessThanOrEqual(0);
  expect(await heightOf(page.getByLabel("Search recipes"))).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  expect(await heightOf(page.getByRole("radio", { name: "Tailoring" }))).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  expect(await heightOf(page.getByLabel("Makes"))).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  expect(await heightOf(page.getByTestId("recipe-more"))).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
});

/** Hold the item-categories fetch until `release` is called, so the skeleton stays up. */
async function holdRecipeData(page: Page): Promise<() => void> {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Only the fetched data file (no query string), not a module import of it.
  await page.route(/itemCategories[^/?]*\.json$/, async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}

/** The heights of the first `count` direct children of a container. */
async function childHeights(container: Locator, count: number): Promise<number[]> {
  const children = container.locator(":scope > *");
  const heights: number[] = [];
  for (let i = 0; i < count; i++) heights.push(await heightOf(children.nth(i)));
  return heights;
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 375, height: 800 },
]) {
  test(`the skeleton matches the search, filters and prompt, then the page replaces it (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const release = await holdRecipeData(page);
    await page.goto(RECIPES);
    const skeleton = page.getByTestId("recipes-skeleton");
    await expect(skeleton).toBeVisible();
    await expect(skeleton.getByTestId("recipes-skeleton-prompt")).toBeVisible();
    const skeletonHeights = await childHeights(skeleton, 4);
    release();
    await expect(skeleton).toHaveCount(0);
    const browser = page.getByTestId("recipe-browser");
    const loadedHeights = await childHeights(browser, 4);
    for (const [i, h] of loadedHeights.entries()) expect(Math.abs(h - skeletonHeights[i]!), `block ${i}: ${JSON.stringify({ skeletonHeights, loadedHeights })}`).toBeLessThanOrEqual(4);
  });
}

test("with a filter in the URL the skeleton shows recipe rows the size of a closed row", async ({ page }) => {
  const release = await holdRecipeData(page);
  await page.goto(`${RECIPES}?p=firstaid`);
  const skeleton = page.getByTestId("recipes-skeleton");
  await expect(skeleton.locator("li")).toHaveCount(6);
  const skeletonRow = await heightOf(skeleton.locator("li").first());
  release();
  await expect(skeleton).toHaveCount(0);
  const row = await heightOf(page.getByTestId("recipe-row").first());
  expect(Math.abs(row - skeletonRow)).toBeLessThanOrEqual(8);
});
