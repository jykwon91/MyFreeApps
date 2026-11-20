/**
 * No-backend E2E: a recipe page that fails to load (a server error) says it
 * couldn't load and offers Try again, which reads it again and shows the
 * recipe. Only a 404 says the recipe wasn't found — a hiccup never tells the
 * user their recipe was deleted. Same behaviour on the recipe page and the
 * tweak page, as on the phone.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { DEFAULT_API_BASE } from "@platform/ui/test-support/constants/defaultApiBase";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { failReads } from "@platform/ui/test-support/routeControls";
import { recipeIdAt } from "./fixtures/recipeFixtures";
import { stubRecipeApi } from "./fixtures/stubRecipeApi";

const RECIPE_ID = recipeIdAt(6);
const MISSING_ID = recipeIdAt(7);
/** The recipe itself, not what lives under it. */
const RECIPE_READ = new RegExp(`${DEFAULT_API_BASE}/recipes/${RECIPE_ID}(\\?.*)?$`);

test("the recipe page offers Try again after a server error, then shows the recipe", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID);
  await failReads(page, RECIPE_READ);

  await page.goto(`/recipes/${RECIPE_ID}`);
  await expect(page.getByText("Can't load this recipe")).toBeVisible();
  await expect(page.getByText("Recipe not found")).toHaveCount(0);

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Viewing v1")).toBeVisible();
  await expect(page.getByText("Can't load this recipe")).toHaveCount(0);
});

test("the tweak page offers Try again after a server error, then opens the form", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID);
  await failReads(page, RECIPE_READ);

  await page.goto(`/recipes/${RECIPE_ID}/tweak`);
  await expect(page.getByText("Can't load this recipe")).toBeVisible();
  await expect(page.getByText("Recipe not found")).toHaveCount(0);

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("What did you change?")).toBeVisible();
  await expect(page.getByText("Can't load this recipe")).toHaveCount(0);
});

test("a recipe the server says doesn't exist is not found, with no retry", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID);

  await page.goto(`/recipes/${MISSING_ID}`);
  await expect(page.getByText("Recipe not found")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);

  await page.goto(`/recipes/${MISSING_ID}/tweak`);
  await expect(page.getByText("Recipe not found")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
});
