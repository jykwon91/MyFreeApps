/**
 * No-backend E2E for /recipes/:id/tweak: the owner opens Tweak from the recipe,
 * the form starts from the latest version, and saving posts a new version that
 * carries each ingredient's lineage key and lands back on the recipe; a failed
 * save says why (the copy shared with the phone) and keeps what was typed; and
 * someone else's recipe can't be tweaked.
 */
import { test, expect, type Page } from "@playwright/test";
import { json } from "@platform/ui/testing/mockResponse";
import { stubSignedInShell } from "@platform/ui/testing/mockSession";
import { SALT_LINEAGE_KEY, TOMATOES_LINEAGE_KEY, VERSION_1_ID, detailOf, recipeIdAt, versionOf } from "./fixtures/recipeFixtures";
import { toast } from "./fixtures/toast";

const RECIPE_ID = recipeIdAt(3);
const BASE_VERSION = versionOf(RECIPE_ID);

function recipe(isOwner: boolean, latest = BASE_VERSION) {
  return detailOf(RECIPE_ID, {
    is_owner: isOwner,
    latest_version: latest,
    version_count: latest.version_number,
    latest_version_number: latest.version_number,
  });
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
      latest = versionOf(RECIPE_ID, 2, { change_note: body.change_note as string });
      return route.fulfill(json(latest, 201));
    }
    if (path.endsWith(`/recipes/${RECIPE_ID}`)) return route.fulfill(json(recipe(isOwner, latest)));
    if (path.endsWith(`/versions/${latest.id}`)) return route.fulfill(json(latest));
    return route.fulfill(json([]));
  });
  return posted;
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
  await page.getByLabel("Quantity", { exact: true }).nth(1).fill("2");
  await page.getByRole("button", { name: "Save new version" }).click();

  await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}$`));
  await expect(toast(page, "New version saved.")).toBeVisible();
  expect(posted).toEqual([
    {
      base_version_id: VERSION_1_ID,
      change_note: "More salt",
      servings: "4",
      prep_minutes: 10,
      cook_minutes: 25,
      ingredients: [
        { name: "tomatoes", quantity: 2, unit: "cans", note: null, lineage_key: TOMATOES_LINEAGE_KEY },
        { name: "salt", quantity: 2, unit: "tsp", note: null, lineage_key: SALT_LINEAGE_KEY },
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
