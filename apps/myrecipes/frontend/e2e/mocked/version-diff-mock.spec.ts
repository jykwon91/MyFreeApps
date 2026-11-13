/**
 * No-backend E2E for the version timeline and /recipes/:id/versions/:vid/diff:
 * picking two versions opens the newer one against the older, the diff reads
 * with the copy shared with the phone, and a version that's gone says so.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import { diffVersions } from "./fixtures/diffVersions";
import {
  SALT_LINEAGE_KEY,
  recipeIdAt,
  detailOf,
  stepIdOf,
  versionIdOf,
  versionOf,
  versionSummaryOf,
} from "./fixtures/recipeFixtures";

const RECIPE_ID = recipeIdAt(4);
const VERSION_COUNT = 3;
// Worded as VERSION_COPY in @myrecipes/api-client; Playwright can't import that CommonJS-typed package at runtime.
const VERSION_COPY = {
  nothing: "nothing",
  loadFailedHeading: "Couldn't load this comparison",
  notInRecipe:
    "One of these versions isn't part of this recipe, or no longer exists. Go back and pick two versions to compare.",
  recipeOrVersionGone: "This recipe or one of its versions no longer exists.",
} as const;
const NOT_FOUND = { detail: "Not Found" };
const BAD_AGAINST = { detail: "against version is not a version of this recipe" };

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
const RECIPE = detailOf(RECIPE_ID, {
  is_owner: false,
  version_count: VERSION_COUNT,
  latest_version_number: VERSION_COUNT,
  latest_version: VERSIONS[VERSION_COUNT - 1]!,
});

const versionById = (id: string | undefined): VersionResponse | undefined =>
  VERSIONS.find((version) => version.id === id);

/**
 * Answers the recipe's public reads like the backend (recipes.py diff_version):
 * a version that is not the recipe's is 404; an `against` that is not the
 * recipe's is 400; without `against` the diff is against the parent, and the
 * first version, which has none, gets everything as added. The diff itself is
 * derived from the versions' bodies. Returns each diff URL asked for.
 */
async function stubRecipe(page: Page): Promise<URL[]> {
  const diffs: URL[] = [];
  await page.route(/\/api\/recipes(\?|$)/, (route) => route.fulfill(json([])));
  await page.route(new RegExp(`/api/recipes/${RECIPE_ID}(/.*)?(\\?.*)?$`), (route) => {
    const url = new URL(route.request().url());
    const [, versionId, diff] = /\/versions\/([^/]+)(\/diff)?$/.exec(url.pathname) ?? [];
    const version = versionById(versionId);
    if (url.pathname.endsWith(`/recipes/${RECIPE_ID}`)) return route.fulfill(json(RECIPE));
    if (url.pathname.endsWith("/versions")) return route.fulfill(json(VERSIONS.map((v) => versionSummaryOf(v))));
    if (!version) return route.fulfill(json(NOT_FOUND, 404));
    if (!diff) return route.fulfill(json(version));

    diffs.push(url);
    const against = url.searchParams.get("against");
    if (against !== null) {
      const from = versionById(against);
      return route.fulfill(from ? json(diffVersions(from, version)) : json(BAD_AGAINST, 400));
    }
    return route.fulfill(json(diffVersions(versionById(version.parent_version_id ?? undefined) ?? null, version)));
  });
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
  await expect(page.getByText("3 changes — 2 ingredient, 1 step.")).toBeVisible();
  await expect(page.getByText("Simmer.")).toBeVisible();
  expect(diffs[0]?.searchParams.has("against")).toBe(false);
});
