/**
 * No-backend E2E for toasts over a modal dialog: a toast raised from inside the
 * recipe's edit dialog (a refused save) or already showing when it opens (a
 * previous save) draws above the backdrop, and dismissing it closes the toast,
 * not the dialog, so what was typed stays put.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { recipeIdAt } from "./fixtures/recipeFixtures";
import { stubRecipeApi } from "./fixtures/stubRecipeApi";
import { toast, toastAboveModal } from "@platform/ui/test-support/toast";

const RECIPE_ID = recipeIdAt(4);
const REFUSED = "Couldn't save those changes — please try again.";
const UPDATED = "Recipe updated.";

/** The recipe reads normally; the edit dialog's save (PATCH) answers 200, or 500 when `refuseSave`. */
async function stubRecipe(page: Page, refuseSave: boolean) {
  await stubRecipeApi(page, RECIPE_ID, { failWith: refuseSave ? { "PATCH /": 500 } : {} });
}

test("a refused save inside the edit dialog shows a toast that can be dismissed without closing the dialog", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipe(page, true);

  await page.goto(`/recipes/${RECIPE_ID}`);
  await page.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit recipe details" });
  await dialog.getByRole("textbox", { name: /Title/ }).fill("Roasted tomato soup");
  await dialog.getByRole("button", { name: "Save changes" }).click();

  await expect(toastAboveModal(page, REFUSED)).toBeVisible();

  // The toast draws above the backdrop: a click on its close button reaches it
  // (Playwright refuses a click another element would intercept).
  await page.getByLabel("Dismiss notification").click();

  await expect(toastAboveModal(page, REFUSED)).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: /Title/ })).toHaveValue("Roasted tomato soup");
});

test("a toast already showing when the dialog opens can be dismissed without closing the dialog", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipe(page, false);

  await page.goto(`/recipes/${RECIPE_ID}`);
  await page.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit recipe details" });
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(toast(page, UPDATED)).toBeVisible();

  // Reopening the dialog leaves the toast an older layer than the dialog.
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(dialog).toBeVisible();
  await page.getByLabel("Dismiss notification").click();

  await expect(toastAboveModal(page, UPDATED)).toHaveCount(0);
  await expect(dialog).toBeVisible();
});
