/**
 * WoW Forever library books. Each test creates its own data through the UI:
 * it ticks books as found, and the page saves those ticks in localStorage.
 * It then drives a player flow (search, item-level chips, Hide found, reload,
 * phone layout, loading) and checks the result on screen and in storage.
 * Finally it removes what it created with "Clear found". The book list itself
 * is the committed game data.
 *
 * Run: npx playwright test --config e2e/playwright.config.ts wow-forever-library
 */
import { test, expect, type Page } from "@playwright/test";

const LIBRARY = "/wow-forever/library";
const CHECKLIST_KEY = "mga.wowForever.library.checklist.v1";
/** Books in the Forever client's ItemSparse (committed data). */
const ALL_BOOKS = 40;
const ANTONIDAS = "Archmage Antonidas: The Unabridged Autobiography";
const ANTONIDAS_ID = "203754";

function storedFound(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), CHECKLIST_KEY);
}

async function markFound(page: Page, name: string, expectedFound: number): Promise<void> {
  await page.getByLabel(`Found: ${name}`).check();
  await expect(page.getByTestId("library-count")).toContainText(`${expectedFound} of ${ALL_BOOKS} found`);
}

/** Cleanup: "Clear found" empties the list and removes the saved key. */
async function clearFound(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Clear found" }).click();
  await expect(page.getByTestId("library-count")).toContainText(`0 of ${ALL_BOOKS} found`);
  expect(await storedFound(page)).toBeNull();
}

test.afterEach(async ({ page }) => {
  // Nothing a test created may outlive it.
  if (page.url().includes(LIBRARY)) expect(await storedFound(page)).toBeNull();
});

test("ticking a book found from the full list, with its facts and tags, then clearing it", async ({ page }) => {
  await page.goto(LIBRARY);
  await expect(page.getByRole("heading", { level: 1, name: "Library books" })).toBeVisible();
  await expect(page).toHaveTitle(/Library books/);

  const books = page.getByTestId("library-book");
  await expect(books).toHaveCount(ALL_BOOKS);
  await expect(page.getByTestId("library-count")).toHaveText(`${ALL_BOOKS} books · 0 of ${ALL_BOOKS} found`);
  const antonidas = books.filter({ hasText: ANTONIDAS });
  await expect(antonidas).toContainText("Item level 10");
  await expect(antonidas).toContainText("addition to any library's collection.");
  await expect(antonidas.getByTestId("library-book-where")).toHaveText("Where: Not known yet");
  await expect(antonidas.getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "client");

  const cards = page.getByTestId("library-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Stormwind Library Card");

  const rewards = page.getByTestId("library-rewards");
  await expect(rewards.getByTestId("library-turn-in")).toHaveText("Not known yet");
  await expect(rewards.getByTestId("library-books-needed")).toHaveText("Not known yet");
  const quest = rewards.getByTestId("library-quest");
  await expect(quest.getByRole("link", { name: "Friend of the Library" })).toHaveAttribute("href", "/wow-forever/quests/78150");
  await expect(quest.getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "seen");
  await expect(quest.getByTestId("library-reward-item")).toHaveCount(2);
  await expect(quest).toContainText("Scholarly Pendant");
  await expect(quest).toContainText("Erudite's Amulet");

  // No location is known, so there is no map link. There is never a Wowhead link.
  await expect(page.getByRole("main").locator('a[href*="/wow-forever/map"]')).toHaveCount(0);
  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);

  await markFound(page, ANTONIDAS, 1);
  await expect(page.getByLabel(`Found: ${ANTONIDAS}`)).toBeChecked();
  expect(await storedFound(page)).toBe(`["${ANTONIDAS_ID}"]`);
  await clearFound(page);
  await expect(page.getByLabel(`Found: ${ANTONIDAS}`)).not.toBeChecked();
});

test("a found book, searched for and hidden, empties the list; filters live in the URL and reset", async ({ page }) => {
  await page.goto(LIBRARY);
  const books = page.getByTestId("library-book");
  await expect(books).toHaveCount(ALL_BOOKS);
  await markFound(page, ANTONIDAS, 1);

  await page.getByTestId("library-search").fill("antonidas archmage");
  await expect(books).toHaveCount(1);
  await expect(page).toHaveURL(/q=antonidas/);
  await page.getByTestId("library-hide-found").click();
  await expect(page).toHaveURL(/hide=1/);
  await expect(page.getByTestId("library-empty")).toBeVisible();
  await expect(books).toHaveCount(0);

  await page.getByTestId("library-empty").getByRole("button", { name: "Reset filters" }).click();
  await expect(books).toHaveCount(ALL_BOOKS);
  await expect(page).not.toHaveURL(/q=|hide=/);

  await page.getByTestId("library-level-chip").filter({ hasText: "Item level 60" }).click();
  await expect(page).toHaveURL(/ilvl=60/);
  await expect.poll(() => books.count()).toBeLessThan(ALL_BOOKS);
  const sixties = await books.count();
  expect(sixties).toBeGreaterThan(0);
  for (const text of await books.allTextContents()) expect(text).toContain("Item level 60");

  await page.getByTestId("library-search").fill("zzzz no such book");
  await expect(page.getByTestId("library-empty")).toContainText("No books match these filters.");
  await page.getByTestId("library-empty").getByRole("button", { name: "Reset filters" }).click();
  await expect(books).toHaveCount(ALL_BOOKS);
  await expect(page).not.toHaveURL(/ilvl=|q=/);

  // A shared link opens with its filters on, and the found tick is still there.
  await page.goto(`${LIBRARY}?ilvl=60`);
  await expect(books).toHaveCount(sixties);
  await expect(page.getByTestId("library-count")).toContainText(`1 of ${ALL_BOOKS} found`);
  await clearFound(page);
});

test("ticking a book as found survives a reload, hides with Hide found and clears", async ({ page }) => {
  await page.goto(LIBRARY);
  const books = page.getByTestId("library-book");
  await expect(books).toHaveCount(ALL_BOOKS);
  await markFound(page, ANTONIDAS, 1);
  expect(await storedFound(page)).toBe(`["${ANTONIDAS_ID}"]`);

  await page.reload();
  await expect(page.getByLabel(`Found: ${ANTONIDAS}`)).toBeChecked();
  await expect(page.getByTestId("library-count")).toHaveText(`${ALL_BOOKS} books · 1 of ${ALL_BOOKS} found`);

  await page.getByTestId("library-hide-found").click();
  await expect(page.getByTestId("library-hide-found")).toHaveAttribute("aria-pressed", "true");
  await expect(books).toHaveCount(ALL_BOOKS - 1);
  await expect(page).toHaveURL(/hide=1/);
  await page.getByTestId("library-hide-found").click();
  await expect(books).toHaveCount(ALL_BOOKS);

  await clearFound(page);
});

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("on a phone a book can be ticked found with 44px controls and no sideways scroll", async ({ page }) => {
    await page.goto(LIBRARY);
    await expect(page.getByTestId("library-book")).toHaveCount(ALL_BOOKS);
    const foundToggle = page.getByLabel(`Found: ${ANTONIDAS}`).locator("xpath=..");
    for (const control of [
      page.getByTestId("library-search"),
      page.getByTestId("library-level-chip").first(),
      page.getByTestId("library-hide-found"),
      foundToggle,
    ]) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    await foundToggle.click();
    await expect(page.getByLabel(`Found: ${ANTONIDAS}`)).toBeChecked();
    await expect(page.getByTestId("library-count")).toContainText(`1 of ${ALL_BOOKS} found`);
    const clear = page.getByRole("button", { name: "Clear found" });
    expect((await clear.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sideways).toBeLessThanOrEqual(0);
    await clearFound(page);
  });
});

test("the skeleton shows while the books load, then a book can be ticked found in the loaded list", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/data\/library\/.*\.json/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(LIBRARY);
  const skeleton = page.getByTestId("library-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute("aria-busy", "true");
  await expect(skeleton.getByTestId("library-skeleton-card")).toHaveCount(5);
  release();
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByTestId("library-filters")).toHaveCount(1);

  await markFound(page, ANTONIDAS, 1);
  await clearFound(page);
});
