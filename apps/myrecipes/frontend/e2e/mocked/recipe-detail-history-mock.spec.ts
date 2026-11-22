/**
 * No-backend E2E: the recipe page's cook log and version timeline never call a
 * log that is still loading, or that failed to load, empty. While loading they
 * show a skeleton; after a failure they say so and offer Try again, which reads
 * them again. "No cooks logged yet" only shows for a log that came back empty.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { DEFAULT_API_BASE } from "@platform/ui/test-support/constants/defaultApiBase";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { failReads, holdReads } from "@platform/ui/test-support/routeControls";
import { cookOf, recipeIdAt } from "./fixtures/recipeFixtures";
import { stubRecipeApi } from "./fixtures/stubRecipeApi";

const RECIPE_ID = recipeIdAt(8);
const COOKS_READ = new RegExp(`${DEFAULT_API_BASE}/recipes/${RECIPE_ID}/cooks(\\?.*)?$`);
const VERSIONS_READ = new RegExp(`${DEFAULT_API_BASE}/recipes/${RECIPE_ID}/versions(\\?.*)?$`);
const EMPTY_COOKS = "No cooks logged yet.";

test("the cook log shows a skeleton while it loads, then the cooks", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID, { cooks: [cookOf()] });
  const gate = await holdReads(page, COOKS_READ);

  await page.goto(`/recipes/${RECIPE_ID}`);
  await expect(page.getByLabel("Loading cook log")).toBeVisible();
  await expect(page.getByText(EMPTY_COOKS)).toHaveCount(0);

  gate.release();
  await expect(page.getByText("Needed more salt")).toBeVisible();
  await expect(page.getByLabel("Loading cook log")).toHaveCount(0);
});

test("a cook log that fails to load says so, never that nothing is logged, and Try again shows the cooks", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID, { cooks: [cookOf()] });
  await failReads(page, COOKS_READ);

  await page.goto(`/recipes/${RECIPE_ID}`);
  await expect(page.getByText("Couldn't load your cook log.")).toBeVisible();
  await expect(page.getByText(EMPTY_COOKS)).toHaveCount(0);

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Needed more salt")).toBeVisible();
  await expect(page.getByText("Couldn't load your cook log.")).toHaveCount(0);
});

test("a cook log that came back empty says nothing is logged", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID);

  await page.goto(`/recipes/${RECIPE_ID}`);
  await expect(page.getByText(EMPTY_COOKS)).toBeVisible();
  await expect(page.getByLabel("Loading cook log")).toHaveCount(0);
});

test("the timeline shows a skeleton while it loads, then the versions", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID);
  const gate = await holdReads(page, VERSIONS_READ);

  await page.goto(`/recipes/${RECIPE_ID}`);
  await expect(page.getByLabel("Loading versions")).toBeVisible();
  await expect(page.getByRole("button", { name: "Compare" })).toHaveCount(0);

  gate.release();
  await expect(page.getByRole("button", { name: /^v1/ })).toBeVisible();
  await expect(page.getByLabel("Loading versions")).toHaveCount(0);
});

test("a timeline that fails to load says so, and Try again shows the versions", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID);
  await failReads(page, VERSIONS_READ);

  await page.goto(`/recipes/${RECIPE_ID}`);
  await expect(page.getByText("Can't load versions")).toBeVisible();
  await expect(page.getByRole("button", { name: "Compare" })).toHaveCount(0);

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: /^v1/ })).toBeVisible();
  await expect(page.getByText("Can't load versions")).toHaveCount(0);
});
