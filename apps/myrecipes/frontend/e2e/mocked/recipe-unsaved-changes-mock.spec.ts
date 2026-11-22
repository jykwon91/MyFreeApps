/**
 * No-backend E2E for the editors' unsaved-changes question: after editing, a click away
 * (a link, Back, Cancel, Escape) asks first; Keep editing stays with what was typed and
 * Discard goes; closing the tab gets the browser's own prompt; and once the recipe, tweak
 * or edit is saved, leaving asks nothing.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { recipeIdAt } from "./fixtures/recipeFixtures";
import { stubRecipeApi } from "./fixtures/stubRecipeApi";
import { stubRecipeCreate } from "./fixtures/stubRecipeCreate";

const CREATED_ID = recipeIdAt(1);
const RECIPE_ID = recipeIdAt(3);

function discardQuestion(page: Page) {
  return page.getByRole("alertdialog", { name: "Discard your changes?" });
}

async function openNewRecipe(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "New recipe" }).first().click();
  await expect(page.getByRole("heading", { name: "New recipe", level: 1 })).toBeVisible();
}

test("a new recipe asks before a link throws it away: Keep editing stays, Discard leaves", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeCreate(page, CREATED_ID);
  await openNewRecipe(page);

  await page.getByLabel(/^Title/).fill("Tomato soup");
  await page.getByRole("link", { name: "Recipes" }).first().click();

  const question = discardQuestion(page);
  await expect(question).toBeVisible();
  await expect(question.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await question.getByRole("button", { name: "Keep editing" }).click();
  await expect(question).toHaveCount(0);
  await expect(page).toHaveURL(/\/recipes\/new$/);
  await expect(page.getByLabel(/^Title/)).toHaveValue("Tomato soup");
  await expect(page.getByRole("link", { name: "Recipes" }).first()).toBeFocused();

  await page.goBack();
  await expect(question).toBeVisible();
  await question.getByRole("button", { name: "Discard" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("closing the tab with a half-typed recipe gets the browser's prompt", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeCreate(page, CREATED_ID);
  await openNewRecipe(page);
  await page.getByLabel(/^Title/).fill("Tomato soup");

  const prompt = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const dialog = await prompt;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
});

test("an untouched new recipe leaves without asking", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeCreate(page, CREATED_ID);
  await openNewRecipe(page);

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(discardQuestion(page)).toHaveCount(0);
});

test("once the recipe is created, nothing asks", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeCreate(page, CREATED_ID);
  await openNewRecipe(page);

  await page.getByLabel(/^Title/).fill("Tomato soup");
  await page.getByLabel("Ingredient name").first().fill("tomatoes");
  await page.getByLabel("Step 1").fill("Simmer.");
  await page.getByRole("button", { name: "Create recipe" }).click();

  await expect(page).toHaveURL(new RegExp(`/recipes/${CREATED_ID}$`));
  await expect(page.getByRole("heading", { name: "Tomato soup" })).toBeVisible();
  await expect(discardQuestion(page)).toHaveCount(0);
  await page.goBack();
  await expect(discardQuestion(page)).toHaveCount(0);
});

test("a tweak asks before Cancel throws away its change note, and leaves freely once saved", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID);

  await page.goto(`/recipes/${RECIPE_ID}`);
  await page.getByRole("button", { name: "Tweak this recipe" }).click();
  await page.getByLabel("What did you change?").fill("More salt");
  await page.getByRole("button", { name: "Cancel" }).click();

  const question = discardQuestion(page);
  await question.getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}/tweak$`));
  await expect(page.getByLabel("What did you change?")).toHaveValue("More salt");

  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}$`));
  await expect(page.getByText("Viewing v2")).toBeVisible();
  await expect(question).toHaveCount(0);
});

test("edit details asks before Escape throws an edit away, and closes freely once saved", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipeApi(page, RECIPE_ID);

  await page.goto(`/recipes/${RECIPE_ID}`);
  const edit = page.getByRole("button", { name: "Edit", exact: true });
  await edit.click();
  const dialog = page.getByRole("dialog", { name: "Edit recipe details" });
  await dialog.getByLabel("Title").fill("Roasted tomato soup");
  await page.keyboard.press("Escape");

  const question = discardQuestion(page);
  await expect(question).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(question).toHaveCount(0);
  await expect(dialog.getByLabel("Title")).toHaveValue("Roasted tomato soup");
  await expect(dialog.getByLabel("Title")).toBeFocused();

  await page.keyboard.press("Escape");
  await question.getByRole("button", { name: "Discard" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();

  await edit.click();
  await dialog.getByLabel("Title").fill("Roasted tomato soup");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(question).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Roasted tomato soup" })).toBeVisible();
});
