/**
 * No-backend E2E for the owner's actions on /recipes/:id: Edit changes the
 * title, description and source; Delete asks first and then returns to the
 * list; "I made it" logs a cook and a cook can be deleted again. Each one sends
 * the right request, shows the outcome, and when the server refuses it says so
 * and leaves the recipe and what was typed as they were. Someone else's recipe
 * offers none of them.
 */
import { test, expect } from "@playwright/test";
import { stubSignedInShell } from "@platform/ui/testing/mockSession";
import { COOK_ID, VERSION_1_ID, cookOf, recipeIdAt } from "./fixtures/recipeFixtures";
import { stubRecipeApi } from "./fixtures/stubRecipeApi";
import { toast, toastAboveModal } from "./fixtures/toast";

const RECIPE_ID = recipeIdAt(5);

test.describe("Edit", () => {
  test("changes the title, description and source, sends only those, and shows them", async ({ page }) => {
    await stubSignedInShell(page);
    const { writes: sent } = await stubRecipeApi(page, RECIPE_ID);

    await page.goto(`/recipes/${RECIPE_ID}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit recipe details" });
    await expect(dialog.getByLabel("Title")).toHaveValue("Tomato soup");
    await expect(dialog.getByLabel("Source")).toHaveValue("Grandma");

    await dialog.getByLabel("Title").fill("  Roasted tomato soup ");
    await dialog.getByLabel("Description").fill("");
    await dialog.getByLabel("Source").fill("A cookbook");
    await dialog.getByRole("button", { name: "Save changes" }).click();

    await expect(toastAboveModal(page, "Recipe updated.")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Roasted tomato soup" })).toBeVisible();
    await expect(page.getByText("Weeknight soup")).toHaveCount(0);
    await expect(page.getByText("A cookbook")).toBeVisible();
    expect(sent).toEqual([
      { method: "PATCH", path: `/recipes/${RECIPE_ID}`, body: { title: "Roasted tomato soup", description: null, source: "A cookbook" } },
    ]);
  });

  test("won't save without a title", async ({ page }) => {
    await stubSignedInShell(page);
    const { writes: sent } = await stubRecipeApi(page, RECIPE_ID);

    await page.goto(`/recipes/${RECIPE_ID}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit recipe details" });
    await dialog.getByLabel("Title").fill("   ");

    await expect(dialog.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(sent).toHaveLength(0);
  });

  test("a refused save says so and keeps the dialog and what was typed", async ({ page }) => {
    await stubSignedInShell(page);
    const { writes: sent } = await stubRecipeApi(page, RECIPE_ID, { failWith: { "PATCH /": 500 } });

    await page.goto(`/recipes/${RECIPE_ID}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit recipe details" });
    await dialog.getByLabel("Title").fill("Roasted tomato soup");
    await dialog.getByRole("button", { name: "Save changes" }).click();

    await expect(toastAboveModal(page, "Couldn't save those changes — please try again.")).toBeVisible();
    await expect(dialog.getByLabel("Title")).toHaveValue("Roasted tomato soup");
    await expect(dialog.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await expect(page.getByRole("heading", { name: "Tomato soup", exact: true, includeHidden: true })).toBeVisible();
    expect(sent).toHaveLength(1);
  });
});

test.describe("Delete", () => {
  test("asks first; cancelling deletes nothing", async ({ page }) => {
    await stubSignedInShell(page);
    const { writes: sent } = await stubRecipeApi(page, RECIPE_ID);

    await page.goto(`/recipes/${RECIPE_ID}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this recipe?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}$`));
    expect(sent).toHaveLength(0);
  });

  test("confirming deletes the recipe and returns to the list", async ({ page }) => {
    await stubSignedInShell(page);
    const { writes: sent } = await stubRecipeApi(page, RECIPE_ID);

    await page.goto(`/recipes/${RECIPE_ID}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete recipe" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(toast(page, "Recipe deleted.")).toBeVisible();
    expect(sent).toEqual([{ method: "DELETE", path: `/recipes/${RECIPE_ID}`, body: null }]);
  });

  test("a refused delete says so and keeps the recipe", async ({ page }) => {
    await stubSignedInShell(page);
    const { writes: sent } = await stubRecipeApi(page, RECIPE_ID, { failWith: { "DELETE /": 500 } });

    await page.goto(`/recipes/${RECIPE_ID}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete recipe" }).click();

    await expect(toastAboveModal(page, "Couldn't delete this recipe — please try again.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}$`));
    await expect(page.getByRole("heading", { name: "Tomato soup", exact: true, includeHidden: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete recipe" })).toBeEnabled();
    expect(sent).toHaveLength(1);
  });
});

test.describe("I made it", () => {
  const COOKS_PATH = `/recipes/${RECIPE_ID}/cooks`;

  test("logs a rated cook against the version being viewed, not the latest, and updates the timeline", async ({ page }) => {
    await stubSignedInShell(page);
    const { writes } = await stubRecipeApi(page, RECIPE_ID, { versionCount: 2 });

    await page.goto(`/recipes/${RECIPE_ID}`);
    await expect(page.getByText("Viewing v2")).toBeVisible();
    await page.getByRole("button", { name: /^v1/ }).click();
    await expect(page.getByText("Viewing v1")).toBeVisible();
    await expect(page.getByText("No cooks logged yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^v1/ })).toContainText("0 cooks");

    await page.getByRole("button", { name: "I made it" }).click();
    const dialog = page.getByRole("dialog", { name: "Log a cook" });
    await expect(dialog.getByText("Recording how v1 turned out this time.")).toBeVisible();
    await dialog.getByRole("radio", { name: "4 stars" }).click();
    await dialog.getByLabel("Notes").fill("  Needed more salt ");
    await dialog.getByRole("button", { name: "Save cook" }).click();

    await expect(toastAboveModal(page, "Cook logged.")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Needed more salt")).toBeVisible();
    await expect(page.getByText("No cooks logged yet.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^v1/ })).toContainText("1 cook");
    await expect(page.getByRole("button", { name: /^v2/ })).toContainText("0 cooks");
    expect(writes).toEqual([
      { method: "POST", path: `/recipes/${RECIPE_ID}/versions/${VERSION_1_ID}/cooks`, body: { rating: 4, outcome_notes: "Needed more salt" } },
    ]);
    });

  test("a refused log says so and keeps the dialog and the notes", async ({ page }) => {
    await stubSignedInShell(page);
    const { writes } = await stubRecipeApi(page, RECIPE_ID, { failWith: { [`POST /versions/${VERSION_1_ID}/cooks`]: 500 } });

    await page.goto(`/recipes/${RECIPE_ID}`);
    await page.getByRole("button", { name: "I made it" }).click();
    const dialog = page.getByRole("dialog", { name: "Log a cook" });
    await dialog.getByLabel("Notes").fill("Doubled the garlic");
    await dialog.getByRole("button", { name: "Save cook" }).click();

    await expect(toastAboveModal(page, "Couldn't log that cook — please try again.")).toBeVisible();
    await expect(dialog.getByLabel("Notes")).toHaveValue("Doubled the garlic");
    await expect(dialog.getByRole("button", { name: "Save cook" })).toBeEnabled();
    await expect(page.getByText("No cooks logged yet.")).toBeVisible();
    expect(writes).toEqual([
      {
        method: "POST",
        path: `/recipes/${RECIPE_ID}/versions/${VERSION_1_ID}/cooks`,
        body: { rating: null, outcome_notes: "Doubled the garlic" },
      },
    ]);
  });

  test("deleting a logged cook asks first, then removes it and the timeline's count", async ({ page }) => {
    await stubSignedInShell(page);
    const { writes } = await stubRecipeApi(page, RECIPE_ID, { cooks: [cookOf()] });

    await page.goto(`/recipes/${RECIPE_ID}`);
    await expect(page.getByText("Needed more salt")).toBeVisible();
    await expect(page.getByRole("button", { name: /^v1/ })).toContainText("1 cook");
    await page.getByRole("button", { name: "Delete cook log" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete cook log?" });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Needed more salt")).toBeVisible();
    expect(writes).toHaveLength(0);

    await page.getByRole("button", { name: "Delete cook log" }).click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(toastAboveModal(page, "Cook log deleted.")).toBeVisible();
    await expect(page.getByText("Needed more salt")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^v1/ })).toContainText("0 cooks");
    expect(writes).toEqual([{ method: "DELETE", path: `${COOKS_PATH}/${COOK_ID}`, body: null }]);
  });

  test("a refused cook delete says so and keeps the cook", async ({ page }) => {
    await stubSignedInShell(page);
    const { writes } = await stubRecipeApi(page, RECIPE_ID, { cooks: [cookOf()], failWith: { [`DELETE /cooks/${COOK_ID}`]: 500 } });

    await page.goto(`/recipes/${RECIPE_ID}`);
    await page.getByRole("button", { name: "Delete cook log" }).click();
    await page.getByRole("dialog", { name: "Delete cook log?" }).getByRole("button", { name: "Delete", exact: true }).click();

    await expect(toastAboveModal(page, "Couldn't delete that cook log — please try again.")).toBeVisible();
    await expect(page.getByText("Needed more salt")).toBeVisible();
    expect(writes).toEqual([{ method: "DELETE", path: `${COOKS_PATH}/${COOK_ID}`, body: null }]);
  });
});

test("someone else's recipe offers no edit, delete or cook actions, and never asks for the private cook log", async ({ page }) => {
  await stubSignedInShell(page);
  const { reads } = await stubRecipeApi(page, RECIPE_ID, { isOwner: false });

  await page.goto(`/recipes/${RECIPE_ID}`);
  await expect(page.getByRole("heading", { name: "Tomato soup", exact: true })).toBeVisible();
  await expect(page.getByText("Viewing v1")).toBeVisible();
  // The timeline has loaded once its v1 entry shows; only then can absent cook data be asserted.
  await expect(page.getByRole("button", { name: /^v1/ })).toBeVisible();
  for (const name of ["Edit", "I made it", "Tweak this recipe"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Cook log" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^v1/ })).not.toContainText("cook");
  expect(reads.filter((path) => path.includes("/cooks"))).toEqual([]);
});
