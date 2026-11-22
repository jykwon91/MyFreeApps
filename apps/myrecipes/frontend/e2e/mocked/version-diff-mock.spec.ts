/**
 * No-backend E2E for the version timeline and /recipes/:id/versions/:vid/diff:
 * picking two versions opens the newer one against the older, the diff reads
 * with the copy shared with the phone, a tweak that only changes servings or
 * times shows those changes, a reorder-only tweak isn't called identical, and a
 * version that's gone says so.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import { stubRecipeApi } from "./fixtures/stubRecipeApi";
import {
  SALT_LINEAGE_KEY,
  recipeIdAt,
  stepIdOf,
  versionIdOf,
  versionOf,
} from "./fixtures/recipeFixtures";

const RECIPE_ID = recipeIdAt(4);
const VERSION_COUNT = 3;
const DIFF_SEGMENT = "/diff";
// Worded as VERSION_COPY in @myrecipes/api-client; Playwright can't import that CommonJS-typed package at runtime.
const VERSION_COPY = {
  nothing: "nothing",
  loadFailedHeading: "Couldn't load this comparison",
  notInRecipe:
    "One of these versions isn't part of this recipe, or no longer exists. Go back and pick two versions to compare.",
  recipeOrVersionGone: "This recipe or one of its versions no longer exists.",
  identicalHeading: "Identical",
  onlyOrderChanged: "Only the order changed.",
  reorderedHeading: "Reordered",
  reorderedBody: "Same ingredients and steps, in a different order.",
  details: "Details",
} as const;

// v1 and v2 share the default body; v3 doubles the salt and adds a step, so v1 -> v3 has two changes.
const V3_BASE = versionOf(RECIPE_ID, VERSION_COUNT, { change_note: "Change 3" });
const VERSIONS: VersionResponse[] = [
  versionOf(RECIPE_ID, 1),
  versionOf(RECIPE_ID, 2, { change_note: "Change 2" }),
  {
    ...V3_BASE,
    ingredients: V3_BASE.ingredients.map((ingredient) =>
      ingredient.lineage_key === SALT_LINEAGE_KEY ? { ...ingredient, quantity: 2 } : ingredient,
    ),
    steps: [...V3_BASE.steps, { id: stepIdOf(VERSION_COUNT, 1), position: 1, instruction: "Stir." }],
  },
];

/**
 * Someone else's recipe with three versions, read through the shared recipe stub
 * (its diff answers like recipes.py diff_version). Returns each diff URL asked for.
 */
async function stubRecipe(page: Page): Promise<URL[]> {
  const diffs: URL[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(DIFF_SEGMENT)) diffs.push(new URL(request.url()));
  });
  await stubRecipeApi(page, RECIPE_ID, { isOwner: false, versions: VERSIONS });
  return diffs;
}

test("compares two picked versions, newer against older, and shows what changed", async ({ page }) => {
  await stubSignedInShell(page);
  const diffs = await stubRecipe(page);

  await page.goto(`/recipes/${RECIPE_ID}`);
  const compare = page.getByRole("button", { name: "Compare" });
  await expect(compare).toBeDisabled();
  await page.getByLabel("Select v3 to compare").check();
  await page.getByLabel("Select v1 to compare").check();
  await expect(page.getByLabel("Select v2 to compare")).toBeDisabled();
  await compare.click();

  await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}/versions/${versionIdOf(3)}/diff\\?against=${versionIdOf(1)}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("v1 to v3");
  await expect(page.getByText("2 changes — 1 ingredient, 1 step.")).toBeVisible();
  await expect(page.getByText("1 tsp salt")).toBeVisible();
  await expect(page.getByText("2 tsp salt")).toBeVisible();
  await expect(page.getByText("Stir.")).toBeVisible();
  expect(diffs[0]?.searchParams.get("against")).toBe(versionIdOf(1));
});

test("says a version is not part of the recipe when the comparison base is not one of its versions", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipe(page);

  await page.goto(`/recipes/${RECIPE_ID}/versions/${versionIdOf(3)}/diff?against=${versionIdOf(9)}`);
  await expect(page.getByRole("heading", { name: VERSION_COPY.loadFailedHeading })).toBeVisible();
  await expect(page.getByText(VERSION_COPY.notInRecipe)).toBeVisible();
  await page.getByRole("button", { name: "Back to recipe" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}$`));
});

test("says the recipe or version no longer exists when the version being viewed is unknown", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipe(page);

  await page.goto(`/recipes/${RECIPE_ID}/versions/${versionIdOf(9)}/diff?against=${versionIdOf(1)}`);
  await expect(page.getByRole("heading", { name: VERSION_COPY.loadFailedHeading })).toBeVisible();
  await expect(page.getByText(VERSION_COPY.recipeOrVersionGone)).toBeVisible();
});

test("shows the first version as all added when it is opened without a base", async ({ page }) => {
  await stubSignedInShell(page);
  const diffs = await stubRecipe(page);

  await page.goto(`/recipes/${RECIPE_ID}/versions/${versionIdOf(1)}/diff`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${VERSION_COPY.nothing} to v1`);
  // The first version's servings and times are new too: 4 servings, 10 min prep, 25 min cook.
  await expect(page.getByText("6 changes — 3 details, 2 ingredients, 1 step.")).toBeVisible();
  await expect(page.getByText("Simmer.")).toBeVisible();
  expect(diffs[0]?.searchParams.has("against")).toBe(false);
});

test("shows a tweak that only changed servings and cook time instead of calling it identical", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID, {
    isOwner: false,
    versions: [versionOf(RECIPE_ID, 1), versionOf(RECIPE_ID, 2, { change_note: "Double batch", servings: "8", cook_minutes: 45 })],
  });

  await page.goto(`/recipes/${RECIPE_ID}/versions/${versionIdOf(2)}/diff`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("v1 to v2");
  await expect(page.getByText("2 changes — 2 details, 0 ingredients, 0 steps.")).toBeVisible();
  await expect(page.getByRole("heading", { name: VERSION_COPY.identicalHeading })).toHaveCount(0);
  const details = page.locator("section").filter({ has: page.getByRole("heading", { name: VERSION_COPY.details }) });
  await expect(details.getByRole("listitem")).toHaveText(["~Changed:Servings:48", "~Changed:Cook time:25 min45 min"]);
});

test("says a tweak that only reordered the ingredients is in a different order, not identical", async ({ page }) => {
  await stubSignedInShell(page);
  const v1 = versionOf(RECIPE_ID, 1);
  const reordered = [...v1.ingredients].reverse().map((ingredient, position) => ({ ...ingredient, position }));
  await stubRecipeApi(page, RECIPE_ID, {
    isOwner: false,
    versions: [v1, versionOf(RECIPE_ID, 2, { change_note: "Salt first", ingredients: reordered })],
  });

  await page.goto(`/recipes/${RECIPE_ID}/versions/${versionIdOf(2)}/diff`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("v1 to v2");
  await expect(page.getByText(VERSION_COPY.onlyOrderChanged)).toBeVisible();
  await expect(page.getByRole("heading", { name: VERSION_COPY.reorderedHeading })).toBeVisible();
  await expect(page.getByText(VERSION_COPY.reorderedBody)).toBeVisible();
  await expect(page.getByRole("heading", { name: VERSION_COPY.identicalHeading })).toHaveCount(0);
});

test("a failed refresh keeps the diff on screen with a notice, and Try again clears it", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipe(page);
  await page.goto(`/recipes/${RECIPE_ID}/versions/${versionIdOf(3)}/diff?against=${versionIdOf(1)}`);
  await expect(page.getByText("2 tsp salt")).toBeVisible();

  // The next read of the diff fails, as when coming back to the tab with no connection.
  let failing = true;
  await page.route(`**/versions/${versionIdOf(3)}/diff*`, (route) =>
    failing ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "boom" }) }) : route.fallback(),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.getByRole("status")).toHaveText(/Couldn't update this comparison/);
  await expect(page.getByText("2 tsp salt")).toBeVisible();
  await expect(page.getByRole("heading", { name: VERSION_COPY.loadFailedHeading })).toHaveCount(0);

  failing = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByText("2 tsp salt")).toBeVisible();
});
