/**
 * No-backend E2E for /recipes/import: a signed-in user picks a photo, it's read
 * into the editor for review, and creating it lands on the new recipe; a failed
 * read says why (the copy shared with the phone) and keeps the photo unless it's the problem, and a
 * draft with more rows than a recipe can have says so instead of posting.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { DEFAULT_API_BASE } from "@platform/ui/test-support/constants/defaultApiBase";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { recipeIdAt } from "./fixtures/recipeFixtures";
import { stubRecipeCreate } from "./fixtures/stubRecipeCreate";
import { PIXEL_PNG } from "@platform/ui/test-support/constants/pixelPng";
import { RECIPE_FORM_PROBLEMS, RECIPE_INGREDIENTS_MAX } from "@myrecipes/api-client/constants/recipeForm";
import type { RecipeExtractionDraft } from "@myrecipes/api-client/types/recipe/extraction";

const CREATED_ID = recipeIdAt(2);
const DRAFT = {
  title: "Grandma's tomato soup",
  description: null,
  source: "Grandma's recipe box",
  servings: "4",
  prep_minutes: 10,
  cook_minutes: 25,
  ingredients: [{ name: "tomatoes", quantity: 2, unit: "cans", note: null }],
  steps: [{ instruction: "Simmer." }],
} satisfies RecipeExtractionDraft;
// A 1x1 PNG: the picker only checks the type and size, and the read is stubbed.
const PHOTO = {
  name: "card.png",
  mimeType: "image/png",
  buffer: PIXEL_PNG,
};

/** POST /recipes/extract answers each status in turn; POST /recipes creates from what was posted. */
async function stubImport(page: Page, extractStatuses: number[], draft: RecipeExtractionDraft = DRAFT) {
  const extracts: string[] = [];
  await page.route(new RegExp(`${DEFAULT_API_BASE}/recipes/extract$`), (route) => {
    extracts.push(route.request().headers()["content-type"] ?? "");
    const status = extractStatuses[extracts.length - 1] ?? 200;
    return route.fulfill(status === 200 ? json(draft) : json({ detail: "no" }, status));
  });
  const posted = await stubRecipeCreate(page, CREATED_ID);
  return { extracts, posted };
}

async function pickPhoto(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await expect(page.getByAltText(`Preview of ${PHOTO.name}`)).toBeVisible();
}

test("reads a photo into the editor, then creates the recipe from it", async ({ page }) => {
  await stubSignedInShell(page);
  const { extracts, posted } = await stubImport(page, [200]);

  await page.goto("/");
  await page.getByRole("button", { name: "Import from photo" }).click();
  await expect(page).toHaveURL(/\/recipes\/import$/);

  await pickPhoto(page);
  await page.getByRole("button", { name: "Extract recipe" }).click();

  await expect(page.getByLabel(/^Title/)).toHaveValue(DRAFT.title);
  await expect(page.getByLabel("Source")).toHaveValue(DRAFT.source);
  await expect(page.getByLabel("Ingredient name").first()).toHaveValue("tomatoes");
  expect(extracts).toEqual([expect.stringContaining("multipart/form-data")]);

  await page.getByRole("button", { name: "Create recipe" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${CREATED_ID}$`));
  await expect(page.getByRole("heading", { name: DRAFT.title })).toBeVisible();
  await expect(page.getByText("Simmer.")).toBeVisible();
  expect(posted).toEqual([expect.objectContaining({ title: DRAFT.title, source: DRAFT.source, prep_minutes: 10 })]);
});

test("a failed read says why; the photo stays unless it is what can't be read", async ({ page }) => {
  await stubSignedInShell(page);
  const { extracts } = await stubImport(page, [413, 429, 422, 200]);

  await page.goto("/recipes/import");
  await pickPhoto(page);
  await page.getByRole("button", { name: "Extract recipe" }).click();
  await expect(
    page.getByText("That photo is too large (max 15 MB and 80 megapixels). Try a smaller or compressed version."),
  ).toBeVisible();

  await pickPhoto(page);
  await page.getByRole("button", { name: "Extract recipe" }).click();
  await expect(page.getByText("You've imported a lot of photos recently. Give it a few minutes and try again.")).toBeVisible();

  // Busy isn't the photo's fault: it's still there to try again.
  await expect(page.getByAltText(`Preview of ${PHOTO.name}`)).toBeVisible();
  await page.getByRole("button", { name: "Extract recipe" }).click();
  await expect(page.getByText("We couldn't read a recipe from that photo. Try a clearer or better-lit photo.")).toBeVisible();

  // No recipe in it is: it's cleared, so another is picked.
  await expect(page.getByAltText(`Preview of ${PHOTO.name}`)).toBeHidden();
  await pickPhoto(page);
  await page.getByRole("button", { name: "Extract recipe" }).click();
  await expect(page.getByLabel(/^Title/)).toHaveValue(DRAFT.title);
  expect(extracts).toHaveLength(4);
});

test("a draft with more ingredients than a recipe can have says so and isn't posted", async ({ page }) => {
  await stubSignedInShell(page);
  const ingredients = Array.from({ length: RECIPE_INGREDIENTS_MAX + 1 }, (_, i) => ({
    name: `item ${i}`,
    quantity: null,
    unit: null,
    note: null,
  }));
  const { posted } = await stubImport(page, [200], { ...DRAFT, ingredients });

  await page.goto("/recipes/import");
  await pickPhoto(page);
  await page.getByRole("button", { name: "Extract recipe" }).click();
  await expect(page.getByLabel(/^Title/)).toHaveValue(DRAFT.title);

  await page.getByRole("button", { name: "Create recipe" }).click();
  await expect(page.getByText(RECIPE_FORM_PROBLEMS.ingredientsTooMany)).toBeVisible();
  await expect(page).toHaveURL(/\/recipes\/import$/);
  expect(posted).toEqual([]);
});
