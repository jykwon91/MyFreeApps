/**
 * No-backend E2E for /discover: a signed-in user searches the web for a dish, sees the loading
 * state and then the result cards, opens one to read it (a second open costs no call), recovers
 * from a failed search or read, and hands a read recipe to the editor, which posts it intact.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { DISCOVERY_QUERY, NAPOLITANO, NAPOLITANO_DETAIL } from "./fixtures/discoveryFixtures";
import { recipeIdAt } from "./fixtures/recipeFixtures";
import { stubDiscoveryApi } from "./fixtures/stubDiscoveryApi";
import { stubRecipeCreate } from "./fixtures/stubRecipeCreate";

const CREATED_ID = recipeIdAt(3);
// The first stage of each wait (api-client constants are CommonJS, which Playwright can't import by name).
const SEARCHING_STATUS = "Searching the web for versions of this dish...";
const READING_STATUS = "Opening the recipe...";
const SEARCH_BUTTON = "Search the web";
const SAVE_BUTTON = "Save to my recipes";
const SEARCH_FAILED = "We couldn't find recipes for that. Try a dish name, like “mexican flan”.";
const READ_FAILED = "We couldn't read a recipe off that page. Open the original to see it.";
const CHEESE_LINE = "4 oz cream cheese (softened)";

/** The result cards: buttons rather than links, since opening one costs a call. */
const resultCards = (page: Page) => page.getByRole("button").filter({ has: page.locator("h3") });

async function search(page: Page, query: string) {
  await page.getByLabel("Dish to search the web for").fill(query);
  await page.getByRole("button", { name: SEARCH_BUTTON }).click();
}

async function openFirstResult(page: Page) {
  await search(page, DISCOVERY_QUERY);
  await expect(resultCards(page)).toHaveCount(3);
  await resultCards(page).first().click();
}

test("searching shows the wait at once, then the result cards", async ({ page }) => {
  await stubSignedInShell(page);
  const api = await stubDiscoveryApi(page, { held: ["search"] });

  await page.goto("/discover");
  await expect(page.getByRole("button", { name: SEARCH_BUTTON })).toBeDisabled();
  await search(page, DISCOVERY_QUERY);

  await expect(page.getByText(SEARCHING_STATUS)).toBeVisible();
  await expect(page.getByRole("button", { name: "Searching..." })).toBeDisabled();
  await expect(resultCards(page)).toHaveCount(0);

  api.release();
  await expect(page.getByText(/3 versions of\s*mexican flan/)).toBeVisible();
  await expect(resultCards(page)).toHaveCount(3);
  await expect(resultCards(page).nth(0)).toContainText(NAPOLITANO.title);
  await expect(resultCards(page).nth(0)).toContainText("Recipe site");
  await expect(resultCards(page).nth(1)).toContainText("Blog");
  await expect(resultCards(page).nth(2)).toContainText("YouTube");
  await expect(page.getByText(SEARCHING_STATUS)).toHaveCount(0);
  expect(api.searches).toEqual([DISCOVERY_QUERY]);
});

test("a suggestion runs the search it names", async ({ page }) => {
  await stubSignedInShell(page);
  const api = await stubDiscoveryApi(page);

  await page.goto("/discover");
  await page.getByRole("button", { name: "Carbonara" }).click();

  await expect(resultCards(page)).toHaveCount(3);
  expect(api.searches).toEqual(["Carbonara"]);
});

test("a result with a picture loads it through our API, and one without still gets a card", async ({ page }) => {
  await stubSignedInShell(page);
  await stubDiscoveryApi(page);

  await page.goto("/discover");
  await search(page, DISCOVERY_QUERY);
  await expect(resultCards(page)).toHaveCount(3);

  const images = page.locator("main img");
  await expect(images).toHaveCount(2);
  for (const src of await images.evaluateAll((els) => els.map((el) => el.getAttribute("src") ?? ""))) {
    expect(src).toMatch(/^\/api\/discovery\/image\?url=/);
  }
  await images.first().scrollIntoViewIfNeeded();
  await expect.poll(() => images.first().evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(resultCards(page).nth(1)).toContainText("Authentic Mexican Flan");
});

test("opening a result reads it in full, and opening it again calls nothing", async ({ page }) => {
  await stubSignedInShell(page);
  const api = await stubDiscoveryApi(page);

  await page.goto("/discover");
  await openFirstResult(page);

  await expect(page.getByRole("button", { name: SAVE_BUTTON })).toBeVisible();
  await expect(page.getByText(NAPOLITANO_DETAIL.summary)).toBeVisible();
  await expect(page.getByText(CHEESE_LINE)).toBeVisible();
  await expect(page.getByText("Bake in a water bath at 325F for 70 minutes.")).toBeVisible();
  await expect(page.getByText(NAPOLITANO_DETAIL.tips[0]!)).toBeVisible();
  await expect(page.getByText(NAPOLITANO_DETAIL.community_notes[0]!)).toBeVisible();
  const original = page.getByRole("link", { name: /View original/ });
  await expect(original).toHaveAttribute("href", NAPOLITANO.url);
  await expect(original).toHaveAttribute("target", "_blank");
  expect(api.reads).toEqual([{ url: NAPOLITANO.url, title: NAPOLITANO.title }]);

  await page.getByRole("button", { name: "Back to results" }).click();
  await expect(resultCards(page)).toHaveCount(3);
  await resultCards(page).first().click();
  await expect(page.getByRole("button", { name: SAVE_BUTTON })).toBeVisible();
  await expect(page.getByText(CHEESE_LINE)).toBeVisible();
  expect(api.reads).toHaveLength(1);
  expect(api.searches).toHaveLength(1);
});

test("opening a result shows the read wait until the page is read", async ({ page }) => {
  await stubSignedInShell(page);
  const api = await stubDiscoveryApi(page, { held: ["read"] });

  await page.goto("/discover");
  await search(page, DISCOVERY_QUERY);
  await expect(resultCards(page)).toHaveCount(3);
  await resultCards(page).first().click();

  await expect(page.getByText(READING_STATUS)).toBeVisible();
  await expect(page.getByRole("heading", { name: NAPOLITANO.title })).toBeVisible();
  await expect(page.getByRole("button", { name: SAVE_BUTTON })).toHaveCount(0);

  api.release();
  await expect(page.getByRole("button", { name: SAVE_BUTTON })).toBeVisible();
  expect(api.reads).toHaveLength(1);
});

test("a failed search says so, keeps the query, and a retry shows the results", async ({ page }) => {
  await stubSignedInShell(page);
  const api = await stubDiscoveryApi(page, { searchStatuses: [422] });

  await page.goto("/discover");
  await search(page, "asdfghjkl");

  await expect(page.getByText(SEARCH_FAILED)).toBeVisible();
  await expect(resultCards(page)).toHaveCount(0);
  await expect(page.getByLabel("Dish to search the web for")).toHaveValue("asdfghjkl");
  await expect(page.getByRole("button", { name: SEARCH_BUTTON })).toBeEnabled();

  await page.getByRole("button", { name: SEARCH_BUTTON }).click();
  await expect(resultCards(page)).toHaveCount(3);
  await expect(page.getByText(SEARCH_FAILED)).toHaveCount(0);
  expect(api.searches).toEqual(["asdfghjkl", "asdfghjkl"]);
});

test("a page that can't be read leaves the results, and opening it again retries", async ({ page }) => {
  await stubSignedInShell(page);
  const api = await stubDiscoveryApi(page, { readStatuses: [422] });

  await page.goto("/discover");
  await openFirstResult(page);

  await expect(page.getByText(READ_FAILED)).toBeVisible();
  await expect(resultCards(page)).toHaveCount(3);

  await resultCards(page).first().click();
  await expect(page.getByRole("button", { name: SAVE_BUTTON })).toBeVisible();
  await expect(page.getByText(READ_FAILED)).toHaveCount(0);
  expect(api.reads).toHaveLength(2);
});

test("saving hands the read recipe to the editor, which posts it with its source", async ({ page }) => {
  await stubSignedInShell(page);
  await stubDiscoveryApi(page);
  const posted = await stubRecipeCreate(page, CREATED_ID);
  const { draft } = NAPOLITANO_DETAIL;

  await page.goto("/discover");
  await openFirstResult(page);
  await page.getByRole("button", { name: SAVE_BUTTON }).click();

  await expect(page.getByRole("heading", { name: "Save this recipe" })).toBeVisible();
  await expect(page.getByLabel(/^Title/)).toHaveValue(draft.title);
  await expect(page.getByLabel("Source")).toHaveValue(`Serious Eats (${NAPOLITANO.url})`);
  await expect(page.getByLabel("Ingredient name").nth(1)).toHaveValue("cream cheese");
  await expect(page.getByLabel("Step 3")).toHaveValue(draft.steps[2]!.instruction);

  await page.getByRole("button", { name: "Create recipe" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${CREATED_ID}$`));
  expect(posted).toEqual([
    {
      title: draft.title,
      description: draft.description,
      source: `Serious Eats (${NAPOLITANO.url})`,
      servings: draft.servings,
      prep_minutes: draft.prep_minutes,
      cook_minutes: draft.cook_minutes,
      ingredients: draft.ingredients.map((ingredient) => ({ ...ingredient, lineage_key: null })),
      steps: draft.steps,
    },
  ]);
});

test("cancelling the save returns to the read recipe without posting anything", async ({ page }) => {
  await stubSignedInShell(page);
  await stubDiscoveryApi(page);
  const posted = await stubRecipeCreate(page, CREATED_ID);

  await page.goto("/discover");
  await openFirstResult(page);
  await page.getByRole("button", { name: SAVE_BUTTON }).click();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByRole("button", { name: SAVE_BUTTON })).toBeVisible();
  expect(posted).toHaveLength(0);
});
