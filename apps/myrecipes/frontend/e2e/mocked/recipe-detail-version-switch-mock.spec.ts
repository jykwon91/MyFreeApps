/**
 * No-backend E2E for picking a version in the timeline on /recipes/:id: until
 * the picked version arrives the page shows the loading skeleton, never the
 * version that was open before; if it can't be loaded the page says so and
 * offers a retry; and "I made it" only ever names and logs the version shown.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { VERSION_1_ID, recipeIdAt } from "./fixtures/recipeFixtures";
import { stubRecipeApi } from "./fixtures/stubRecipeApi";

const RECIPE_ID = recipeIdAt(5);
const VERSION_1_URL = `**/recipes/${RECIPE_ID}/versions/${VERSION_1_ID}`;

test("a picked version that is still loading shows the skeleton, not the previous version, and can't be logged", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID, { versionCount: 2 });

  await page.goto(`/recipes/${RECIPE_ID}`);
  await expect(page.getByText("Viewing v2")).toBeVisible();

  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(VERSION_1_URL, async (route) => {
    await held;
    await route.fallback();
  });
  await page.getByRole("button", { name: /^v1/ }).click();

  await expect(page.getByLabel("Loading recipe")).toBeVisible();
  await expect(page.getByText("Viewing v2")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "I made it" })).toBeDisabled();

  release();
  await expect(page.getByText("Viewing v1")).toBeVisible();
  await expect(page.getByRole("button", { name: "I made it" })).toBeEnabled();
});

test("a picked version that fails to load says so with a retry, never the previous version", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID, { versionCount: 2 });

  await page.goto(`/recipes/${RECIPE_ID}`);
  await expect(page.getByText("Viewing v2")).toBeVisible();

  let failing = true;
  await page.route(VERSION_1_URL, async (route) => {
    if (failing) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "boom" }) });
    return route.fallback();
  });
  await page.getByRole("button", { name: /^v1/ }).click();

  await expect(page.getByText("Couldn't load this version")).toBeVisible();
  await expect(page.getByText("Viewing v2")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "I made it" })).toBeDisabled();

  failing = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Viewing v1")).toBeVisible();
  await expect(page.getByText("Couldn't load this version")).toHaveCount(0);
});
