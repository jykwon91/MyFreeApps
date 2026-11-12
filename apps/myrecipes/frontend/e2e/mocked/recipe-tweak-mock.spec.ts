/**
 * No-backend E2E for /recipes/:id/tweak: the owner opens Tweak from the recipe,
 * the form starts from the latest version, and saving posts a new version that
 * carries each ingredient's lineage key and lands back on the recipe; a failed
 * save says why (the copy shared with the phone) and keeps what was typed; and
 * someone else's recipe can't be tweaked.
 */
import { test, expect, type Page } from "@playwright/test";
import { json } from "@platform/ui/testing/mockResponse";
import { stubSignedInShell, TEST_USER } from "@platform/ui/testing/mockSession";

const RECIPE_ID = "33333333-3333-3333-3333-333333333333";
const NOW = "2026-11-11T00:00:00Z";

const BASE_VERSION = {
  id: "v1",
  recipe_id: RECIPE_ID,
  version_number: 1,
  parent_version_id: null,
  change_note: null,
  servings: "4",
  prep_minutes: 10,
  cook_minutes: 25,
  created_at: NOW,
  ingredients: [
    { id: "i1", lineage_key: "lk-tomatoes", position: 0, name: "tomatoes", quantity: 2, unit: "cans", note: null },
    { id: "i2", lineage_key: "lk-salt", position: 1, name: "salt", quantity: 1, unit: "tsp", note: null },
  ],
  steps: [{ id: "s1", position: 0, instruction: "Simmer." }],
};

function recipe(isOwner: boolean, latest = BASE_VERSION) {
  return {
    id: RECIPE_ID,
    title: "Tomato soup",
    description: null,
    source: null,
    created_at: NOW,
    updated_at: NOW,
    version_count: latest.version_number,
    latest_version_number: latest.version_number,
    is_owner: isOwner,
    owner_display_name: TEST_USER.display_name,
    best_rating: null,
    last_cooked_at: null,
    latest_version: latest,
  };
}

/** The recipe's reads answer from the latest version; POST .../versions answers `postStatus`. */
async function stubRecipe(page: Page, { isOwner = true, postStatus = 201 } = {}) {
  const posted: Array<Record<string, unknown>> = [];
  let latest = BASE_VERSION;
  await page.route(/\/api\/recipes(\?|$)/, (route) => route.fulfill(json([])));
  await page.route(new RegExp(`/api/recipes/${RECIPE_ID}(/.*)?(\\?.*)?$`), (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path.endsWith("/versions")) {
      const body = request.postDataJSON() as Record<string, unknown>;
      posted.push(body);
      if (postStatus !== 201) return route.fulfill(json({ detail: "no" }, postStatus));
      latest = { ...BASE_VERSION, id: "v2", version_number: 2, parent_version_id: "v1", change_note: body.change_note as string };
      return route.fulfill(json(latest, 201));
    }
    if (path.endsWith(`/recipes/${RECIPE_ID}`)) return route.fulfill(json(recipe(isOwner, latest)));
    if (path.endsWith(`/versions/${latest.id}`)) return route.fulfill(json(latest));
    return route.fulfill(json([]));
  });
  return posted;
}

function toast(page: Page, message: string) {
  return page.getByRole("region", { name: "Notifications" }).getByText(message, { exact: true });
}

test("tweaks the recipe into a new version, carrying lineage keys, then lands on it", async ({ page }) => {
  await stubSignedInShell(page);
  const posted = await stubRecipe(page);

  await page.goto(`/recipes/${RECIPE_ID}`);
  await page.getByRole("button", { name: "Tweak this recipe" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}/tweak$`));

  await expect(page.getByLabel("Ingredient name").first()).toHaveValue("tomatoes");
  await expect(page.getByLabel("Servings")).toHaveValue("4");

  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(toast(page, "Add a note describing what you changed.")).toBeVisible();
  expect(posted).toHaveLength(0);

  await page.getByLabel("What did you change?").fill("More salt");
  await page.getByLabel("Quantity").nth(1).fill("2");
  await page.getByRole("button", { name: "Save new version" }).click();

  await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}$`));
  await expect(toast(page, "New version saved.")).toBeVisible();
  expect(posted).toEqual([
    {
      base_version_id: "v1",
      change_note: "More salt",
      servings: "4",
      prep_minutes: 10,
      cook_minutes: 25,
      ingredients: [
        { name: "tomatoes", quantity: 2, unit: "cans", note: null, lineage_key: "lk-tomatoes" },
        { name: "salt", quantity: 2, unit: "tsp", note: null, lineage_key: "lk-salt" },
      ],
      steps: [{ instruction: "Simmer." }],
    },
  ]);
});

test("a failed save says why and keeps what was typed", async ({ page }) => {
  await stubSignedInShell(page);
  const posted = await stubRecipe(page, { postStatus: 404 });

  await page.goto(`/recipes/${RECIPE_ID}/tweak`);
  await page.getByLabel("What did you change?").fill("More salt");
  await page.getByRole("button", { name: "Save new version" }).click();

  await expect(toast(page, "This recipe has changed or is no longer yours. Go back to it and try again.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}/tweak$`));
  await expect(page.getByLabel("What did you change?")).toHaveValue("More salt");
  expect(posted).toHaveLength(1);
});

test("someone else's recipe can't be tweaked", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipe(page, { isOwner: false });

  await page.goto(`/recipes/${RECIPE_ID}/tweak`);
  await expect(page.getByRole("heading", { name: "You can only tweak your own recipes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save new version" })).toHaveCount(0);
});
