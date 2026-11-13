/**
 * No-backend E2E for /recipes/:id/tweak: the owner opens Tweak from the recipe,
 * the form starts from the latest version, and saving posts a new version that
 * carries each ingredient's lineage key and lands back on the recipe; a failed
 * save says why (the copy shared with the phone) and keeps what was typed; and
 * someone else's recipe can't be tweaked.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { holdReads } from "@platform/ui/test-support/routeControls";
import type { SentRequest } from "@platform/ui/test-support/types/SentRequest";
import { SALT_LINEAGE_KEY, TOMATOES_LINEAGE_KEY, VERSION_1_ID, recipeIdAt } from "./fixtures/recipeFixtures";
import { stubRecipeApi } from "./fixtures/stubRecipeApi";
import { toast } from "@platform/ui/test-support/toast";

const RECIPE_ID = recipeIdAt(3);
const POST_VERSION = { method: "POST", path: `/recipes/${RECIPE_ID}/versions` };

/** The tweaks the page posted, in order. */
function posted(writes: SentRequest[]): unknown[] {
  return writes.filter((write) => write.method === POST_VERSION.method && write.path === POST_VERSION.path).map((write) => write.body);
}

test("tweaks the recipe into a new version, carrying lineage keys, then lands on it", async ({ page }) => {
  await stubSignedInShell(page);
  const { writes } = await stubRecipeApi(page, RECIPE_ID);

  await page.goto(`/recipes/${RECIPE_ID}`);
  await page.getByRole("button", { name: "Tweak this recipe" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}/tweak$`));

  await expect(page.getByLabel("Ingredient name").first()).toHaveValue("tomatoes");
  await expect(page.getByLabel("Servings")).toHaveValue("4");

  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(toast(page, "Add a note describing what you changed.")).toBeVisible();
  expect(posted(writes)).toHaveLength(0);

  await page.getByLabel("What did you change?").fill("More salt");
  await page.getByLabel("Quantity", { exact: true }).nth(1).fill("2");
  await page.getByRole("button", { name: "Save new version" }).click();

  await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}$`));
  await expect(toast(page, "New version saved.")).toBeVisible();
  await expect(page.getByText("Viewing v2")).toBeVisible();
  expect(posted(writes)).toEqual([
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
  const { writes } = await stubRecipeApi(page, RECIPE_ID, { failWith: { "POST /versions": 404 } });

  await page.goto(`/recipes/${RECIPE_ID}/tweak`);
  await page.getByLabel("What did you change?").fill("More salt");
  await page.getByRole("button", { name: "Save new version" }).click();

  await expect(toast(page, "This recipe has changed or is no longer yours. Go back to it and try again.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}/tweak$`));
  await expect(page.getByLabel("What did you change?")).toHaveValue("More salt");
  expect(posted(writes)).toHaveLength(1);
});

test("someone else's recipe can't be tweaked", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID, { isOwner: false });

  await page.goto(`/recipes/${RECIPE_ID}/tweak`);
  await expect(page.getByRole("heading", { name: "You can only tweak your own recipes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save new version" })).toHaveCount(0);
});

test("right after a save, the recipe shows the version it was read at until the refetch lands, then the new one", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID);

  // Straight to the tweak form, so the recipe's first version body was never read; the saved
  // tweak refetches the recipe, and until that answers the page still points at version 1.
  await page.goto(`/recipes/${RECIPE_ID}/tweak`);
  await expect(page.getByLabel("Servings")).toHaveValue("4");
  const refetch = await holdReads(page, new RegExp(`/api/recipes/${RECIPE_ID}$`));
  try {
    await page.getByLabel("What did you change?").fill("More salt");
    await page.getByLabel("Quantity", { exact: true }).nth(1).fill("2");
    await page.getByRole("button", { name: "Save new version" }).click();

    await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}$`));
    await expect(page.getByText("Viewing v1")).toBeVisible();
    await expect(page.getByText("1 tsp salt")).toBeVisible();
  } finally {
    refetch.release();
  }

  await expect(page.getByText("Viewing v2")).toBeVisible();
  await expect(page.getByText("2 tsp salt")).toBeVisible();
});
