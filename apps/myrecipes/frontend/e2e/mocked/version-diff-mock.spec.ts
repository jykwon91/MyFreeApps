/**
 * No-backend E2E for the version timeline and /recipes/:id/versions/:vid/diff:
 * picking two versions opens the newer one against the older, the diff reads
 * with the copy shared with the phone, and a version that's gone says so.
 */
import { test, expect, type Page } from "@playwright/test";
import { json } from "@platform/ui/testing/mockResponse";
import { stubSignedInShell, TEST_USER } from "@platform/ui/testing/mockSession";

const RECIPE_ID = "44444444-4444-4444-4444-444444444444";
const NOW = "2026-11-11T00:00:00Z";

function version(n: number) {
  return {
    id: `v${n}`,
    recipe_id: RECIPE_ID,
    version_number: n,
    parent_version_id: n === 1 ? null : `v${n - 1}`,
    change_note: n === 1 ? null : `Change ${n}`,
    servings: "4",
    prep_minutes: null,
    cook_minutes: null,
    created_at: NOW,
    ingredients: [],
    steps: [],
  };
}

const RECIPE = {
  id: RECIPE_ID,
  title: "Tomato soup",
  description: null,
  source: null,
  created_at: NOW,
  updated_at: NOW,
  version_count: 3,
  latest_version_number: 3,
  is_owner: false,
  owner_display_name: TEST_USER.display_name,
  best_rating: null,
  last_cooked_at: null,
  latest_version: version(3),
};

const SUMMARIES = [1, 2, 3].map((n) => ({
  id: `v${n}`,
  version_number: n,
  change_note: version(n).change_note,
  created_at: NOW,
  cook_count: null,
  best_rating: null,
}));

const SALT = { name: "salt", quantity: 1, unit: "tsp", note: null };
const DIFF = {
  from_version_id: "v1",
  from_version_number: 1,
  to_version_id: "v3",
  to_version_number: 3,
  ingredient_changes: [{ lineage_key: "lk-salt", change: "changed", before: SALT, after: { ...SALT, quantity: 2 } }],
  step_changes: [{ position: 1, change: "added", before: null, after: "Stir." }],
};

/** Answers the recipe's reads; the diff answers `diffStatus`. Returns each diff URL asked for. */
async function stubRecipe(page: Page, diffStatus = 200) {
  const diffs: URL[] = [];
  await page.route(/\/api\/recipes(\?|$)/, (route) => route.fulfill(json([])));
  await page.route(new RegExp(`/api/recipes/${RECIPE_ID}(/.*)?(\\?.*)?$`), (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/diff")) {
      diffs.push(url);
      return route.fulfill(diffStatus === 200 ? json(DIFF) : json({ detail: "no" }, diffStatus));
    }
    if (url.pathname.endsWith(`/recipes/${RECIPE_ID}`)) return route.fulfill(json(RECIPE));
    if (url.pathname.endsWith("/versions")) return route.fulfill(json(SUMMARIES));
    const match = url.pathname.match(/\/versions\/v(\d)$/);
    if (match) return route.fulfill(json(version(Number(match[1]))));
    return route.fulfill(json([]));
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

  await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}/versions/v3/diff\\?against=v1$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("v1 to v3");
  await expect(page.getByText("2 changes — 1 ingredient, 1 step.")).toBeVisible();
  await expect(page.getByText("1 tsp salt")).toBeVisible();
  await expect(page.getByText("2 tsp salt")).toBeVisible();
  await expect(page.getByText("Stir.")).toBeVisible();
  expect(diffs[0]?.searchParams.get("against")).toBe("v1");
});

test("says a version is gone when the comparison 404s", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipe(page, 404);

  await page.goto(`/recipes/${RECIPE_ID}/versions/v3/diff?against=v9`);
  await expect(page.getByRole("heading", { name: "Couldn't load this comparison" })).toBeVisible();
  await expect(
    page.getByText("This recipe or one of its versions no longer exists."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to recipe" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}$`));
});
