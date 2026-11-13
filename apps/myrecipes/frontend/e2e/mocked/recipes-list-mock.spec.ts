/**
 * No-backend E2E for the recipes list (/): the signed-in user searches by title
 * and narrows to their own recipes (each sends the filter to the server and
 * keeps it in the URL), an empty library and an empty search each say so, a
 * failed load says so instead of showing an empty library, and the loading
 * skeleton has the same grid as the loaded list.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { createGate } from "@platform/ui/test-support/gate";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import type { RecipeSummary } from "@myrecipes/api-client/types/recipe/recipe";
import type { ListAnswer } from "./types/ListAnswer";
import type { ListCall } from "./types/ListCall";
import { detailOf, recipeIdAt, summaryOf, versionOf } from "./fixtures/recipeFixtures";
import { RECIPES_COLLECTION_ROUTE } from "./fixtures/recipeRoutes";
import { stubRecipeRoutes } from "./fixtures/stubRecipeApi";

const TOMATO = summaryOf(recipeIdAt(1), "Tomato soup", { description: "Weeknight soup", best_rating: 4 });
const PANCAKES = summaryOf(recipeIdAt(2), "Pancakes");
const SOMEONE_ELSES = summaryOf(recipeIdAt(3), "Tomato salad", { is_owner: false, owner_display_name: "Sam" });

/** GET /recipes answers `answer(call)` and records every call's filters. */
async function stubList(page: Page, answer: (call: ListCall) => ListAnswer | Promise<ListAnswer>): Promise<ListCall[]> {
  const calls: ListCall[] = [];
  await page.route(RECIPES_COLLECTION_ROUTE, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    const call = { search: params.get("search"), owner: params.get("owner") };
    calls.push(call);
    const { body, status } = await answer(call);
    return route.fulfill(json(body, status));
  });
  return calls;
}

const BOX_TOLERANCE_PX = 2;

test("searching by title asks the server and keeps the search in the URL", async ({ page }) => {
  await stubSignedInShell(page);
  const everything: RecipeSummary[] = [TOMATO, PANCAKES, SOMEONE_ELSES];
  const calls = await stubList(page, ({ search }) => ({
    body: everything.filter((r) => !search || r.title.toLowerCase().includes(search.toLowerCase())),
  }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pancakes" })).toBeVisible();
  expect(calls[0]).toEqual({ search: null, owner: null });

  await page.getByLabel("Search recipes by title").pressSequentially("tomato");

  await expect(page).toHaveURL(/[?&]q=tomato$/);
  await expect(page.getByRole("heading", { name: "Pancakes" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tomato soup" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tomato salad" })).toBeVisible();
  expect(calls[calls.length - 1]).toEqual({ search: "tomato", owner: null });
  // Six keystrokes, one request: the debounce sent only the finished word.
  expect(calls.filter((c) => c.search !== null)).toEqual([{ search: "tomato", owner: null }]);

  await page.getByLabel("Search recipes by title").fill("");
  await expect(page.getByRole("heading", { name: "Pancakes" })).toBeVisible();
  await expect(page).not.toHaveURL(/q=/);
});

test("a search that finds nothing says so, and clearing it brings the recipes back", async ({ page }) => {
  await stubSignedInShell(page);
  await stubList(page, ({ search }) => ({ body: search ? [] : [TOMATO] }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tomato soup" })).toBeVisible();

  await page.getByLabel("Search recipes by title").fill("zzz");
  await expect(page.getByRole("heading", { name: "No matches" })).toBeVisible();
  await expect(page.getByText("No recipes match your search. Try a different title.")).toBeVisible();

  await page.getByLabel("Search recipes by title").fill("");
  await expect(page.getByRole("heading", { name: "Tomato soup" })).toBeVisible();
});

test("My recipes narrows the list to the user's own and toggles back", async ({ page }) => {
  await stubSignedInShell(page);
  const calls = await stubList(page, ({ owner }) => ({
    body: owner === "me" ? [TOMATO, PANCAKES] : [TOMATO, PANCAKES, SOMEONE_ELSES],
  }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tomato salad" })).toBeVisible();
  const mine = page.getByRole("button", { name: "My recipes" });
  await expect(mine).toHaveAttribute("aria-pressed", "false");

  await mine.click();
  await expect(mine).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/[?&]owner=me/);
  await expect(page.getByRole("heading", { name: "Tomato salad" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Pancakes" })).toBeVisible();
  expect(calls[calls.length - 1]).toEqual({ search: null, owner: "me" });

  await mine.click();
  await expect(mine).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "Tomato salad" })).toBeVisible();
  await expect(page).not.toHaveURL(/owner=/);
});

test("a recipe card shows its rollups and opens the recipe", async ({ page }) => {
  await stubSignedInShell(page);
  await stubList(page, () => ({ body: [{ ...TOMATO, version_count: 3, latest_version_number: 3 }, SOMEONE_ELSES] }));
  const recipe = detailOf(TOMATO.id, { ...TOMATO, version_count: 3, latest_version_number: 3, latest_version: versionOf(TOMATO.id, 3) });
  await stubRecipeRoutes(page, TOMATO.id, { recipe });

  await page.goto("/");
  const mine = page.getByRole("link", { name: /Tomato soup/ });
  await expect(mine).toContainText("v3");
  await expect(mine).toContainText("3 versions");
  await expect(mine).toContainText("Not cooked yet");
  const theirs = page.getByRole("link", { name: /Tomato salad/ });
  await expect(theirs).toContainText("by Sam");
  await expect(theirs).not.toContainText("Not cooked yet");

  await mine.click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${TOMATO.id}$`));
  await expect(page.getByRole("heading", { name: "Tomato soup", level: 1 })).toBeVisible();
});

test("an empty library offers New recipe, which opens the editor", async ({ page }) => {
  await stubSignedInShell(page);
  await stubList(page, () => ({ body: [] }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "No recipes yet" })).toBeVisible();
  const emptyState = page.getByRole("heading", { name: "No recipes yet" }).locator("xpath=..");
  await emptyState.getByRole("button", { name: "New recipe" }).click();
  await expect(page).toHaveURL(/\/recipes\/new$/);
});

test("a failed load says so instead of showing an empty library, and a refresh recovers", async ({ page }) => {
  await stubSignedInShell(page);
  let failing = true;
  await stubList(page, () => (failing ? { body: { detail: "boom" }, status: 500 } : { body: [TOMATO] }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Couldn't load recipes" })).toBeVisible();
  await expect(page.getByText("The server returned 500. Try refreshing.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "No recipes yet" })).toHaveCount(0);

  failing = false;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tomato soup" })).toBeVisible();
});

test("while loading, the skeleton has the same grid as the loaded list", async ({ page }) => {
  await stubSignedInShell(page);
  const gate = createGate();
  let skeletonCards = 0;
  await stubList(page, async () => {
    await gate.wait;
    return { body: Array.from({ length: skeletonCards }, (_, i) => summaryOf(recipeIdAt(10 + i), `Recipe ${i + 1}`)) };
  });

  try {
    await page.goto("/");
    const skeleton = page.getByLabel("Loading recipes");
    await expect(skeleton).toBeVisible();
    const skeletonItems = skeleton.locator("> div");
    skeletonCards = await skeletonItems.count();
    expect(skeletonCards).toBeGreaterThan(1);
    const skeletonColumns = await skeleton.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    const skeletonFirst = await skeletonItems.first().boundingBox();

    gate.release();
    const loaded = page.locator('[aria-busy="false"]').filter({ has: page.getByRole("link") });
    await expect(page.getByRole("heading", { name: "Recipe 1", exact: true })).toBeVisible();
    await expect(skeleton).toHaveCount(0);
    // Same columns, and the first card where the first skeleton card was. (The card count is
    // not compared: the stub builds the list from the skeleton's own count.)
    expect(await loaded.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).toBe(skeletonColumns);
    const loadedFirst = await loaded.locator("> a").first().boundingBox();
    expect(skeletonFirst).not.toBeNull();
    expect(loadedFirst).not.toBeNull();
    expect(Math.abs(loadedFirst!.x - skeletonFirst!.x)).toBeLessThanOrEqual(BOX_TOLERANCE_PX);
    expect(Math.abs(loadedFirst!.width - skeletonFirst!.width)).toBeLessThanOrEqual(BOX_TOLERANCE_PX);
  } finally {
    gate.release();
  }
});
