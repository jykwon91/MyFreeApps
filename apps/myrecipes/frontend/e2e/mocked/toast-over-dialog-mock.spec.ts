/**
 * No-backend E2E for toasts over a modal dialog: a toast raised from inside the
 * recipe's edit dialog (a refused save) or already showing when it opens (a
 * previous save) draws above the backdrop, and dismissing it closes the toast,
 * not the dialog, so what was typed stays put.
 */
import { test, expect, type Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell, TEST_USER } from "@platform/ui/test-support/mockSession";
import { toast, toastAboveModal } from "@platform/ui/test-support/toast";

const RECIPE_ID = "44444444-4444-4444-4444-444444444444";
const NOW = "2026-11-12T00:00:00Z";
const REFUSED = "Couldn't save those changes — please try again.";
const UPDATED = "Recipe updated.";

const VERSION = {
  id: "v1",
  recipe_id: RECIPE_ID,
  version_number: 1,
  parent_version_id: null,
  change_note: null,
  servings: "4",
  prep_minutes: 10,
  cook_minutes: 25,
  created_at: NOW,
  ingredients: [],
  steps: [],
};

const RECIPE = {
  id: RECIPE_ID,
  title: "Tomato soup",
  description: null,
  source: null,
  created_at: NOW,
  updated_at: NOW,
  version_count: 1,
  latest_version_number: 1,
  is_owner: true,
  owner_display_name: TEST_USER.display_name,
  best_rating: null,
  last_cooked_at: null,
  latest_version: VERSION,
};

/** The recipe reads normally; the edit dialog's save (PATCH) answers `patchStatus`. */
async function stubRecipe(page: Page, patchStatus: 200 | 500) {
  await page.route(/\/api\/recipes(\?|$)/, (route) => route.fulfill(json([])));
  await page.route(new RegExp(`/api/recipes/${RECIPE_ID}(/.*)?(\\?.*)?$`), (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "PATCH") {
      if (patchStatus === 500) return route.fulfill(json({ detail: "no" }, 500));
      return route.fulfill(json({ ...RECIPE, ...(request.postDataJSON() as Record<string, unknown>) }));
    }
    if (path.endsWith(`/recipes/${RECIPE_ID}`)) return route.fulfill(json(RECIPE));
    if (path.endsWith(`/versions/${VERSION.id}`)) return route.fulfill(json(VERSION));
    return route.fulfill(json([]));
  });
}

test("a refused save inside the edit dialog shows a toast that can be dismissed without closing the dialog", async ({ page }) => {
  await stubSignedInShell(page);
  await stubRecipe(page, 500);

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
  await stubRecipe(page, 200);

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
