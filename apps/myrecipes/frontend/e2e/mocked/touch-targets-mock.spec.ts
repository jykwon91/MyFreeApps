/**
 * No-backend E2E: every small control on the website is at least 44x44px, the minimum a finger
 * can hit reliably. The version-compare checkbox is measured by the label that wraps it, since
 * the visible box stays small while the label is the hit area.
 */
import type { Locator } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { NAPOLITANO_DETAIL, DISCOVERY_QUERY } from "./fixtures/discoveryFixtures";
import { cookOf, recipeIdAt } from "./fixtures/recipeFixtures";
import { stubDiscoveryApi } from "./fixtures/stubDiscoveryApi";
import { stubRecipeApi } from "./fixtures/stubRecipeApi";

const MIN_TOUCH_PX = 44;
const RECIPE_ID = recipeIdAt(9);

async function expectTouchSized(locator: Locator) {
  await expect(locator.first()).toBeVisible();
  for (const target of await locator.all()) {
    const box = await target.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
  }
}

test("the editor's ingredient and step move and remove buttons are 44px", async ({ page }) => {
  await stubSignedInShell(page);
  await page.goto("/recipes/new");

  await expectTouchSized(page.getByRole("button", { name: /^(Move|Remove) ingredient/ }));
  await expectTouchSized(page.getByRole("button", { name: /^(Move|Remove) step/ }));
});

test("the recipe page's back link, cook delete and compare checkbox are 44px", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID, { versionCount: 2, cooks: [cookOf()] });
  await page.goto(`/recipes/${RECIPE_ID}`);

  await expectTouchSized(page.getByRole("link", { name: "Recipes", exact: true }));
  await expectTouchSized(page.getByRole("button", { name: "Delete cook log" }));
  await expectTouchSized(page.locator("label").filter({ has: page.getByRole("checkbox") }));
});

test("the discover suggestion chips and Back to results are 44px", async ({ page }) => {
  await stubSignedInShell(page);
  await stubDiscoveryApi(page);
  await page.goto("/discover");

  await expectTouchSized(page.getByRole("button", { name: "Carbonara" }));

  await page.getByLabel("Dish to search the web for").fill(DISCOVERY_QUERY);
  await page.getByRole("button", { name: "Search the web" }).click();
  await page.getByRole("button").filter({ has: page.locator("h2") }).first().click();
  await expect(page.getByRole("heading", { name: NAPOLITANO_DETAIL.title })).toBeVisible();

  await expectTouchSized(page.getByRole("button", { name: "Back to results" }));
});
