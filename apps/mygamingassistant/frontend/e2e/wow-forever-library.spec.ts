/**
 * WoW Forever library books — the books (Forever game files), the library
 * cards, the Friend of the Library reward (seen in game), the search / item
 * level / hide-found filters (kept in the URL), the found checklist across a
 * reload, the phone layout and the loading skeleton. Runs on the committed data.
 *
 * Run: npx playwright test --config e2e/playwright.config.ts wow-forever-library
 */
import { test, expect, type Page } from "@playwright/test";

const LIBRARY = "/wow-forever/library";
const CHECKLIST_KEY = "mga.wowForever.library.checklist.v1";
/** Books in the Forever client's ItemSparse (committed data). */
const ALL_BOOKS = 40;

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("the page lists every book, the library cards and the reward quest, each tagged", async ({ page }) => {
  await page.goto(LIBRARY);
  await expect(page.getByRole("heading", { level: 1, name: "Library books" })).toBeVisible();
  await expect(page).toHaveTitle(/Library books/);

  const books = page.getByTestId("library-book");
  await expect(books).toHaveCount(ALL_BOOKS);
  await expect(page.getByTestId("library-count")).toHaveText(`${ALL_BOOKS} books · 0 of ${ALL_BOOKS} found`);
  const antonidas = books.filter({ hasText: "Archmage Antonidas: The Unabridged Autobiography" });
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

  // No location is known, so there's no map link; never a Wowhead link.
  await expect(page.getByRole("main").locator('a[href*="/wow-forever/map"]')).toHaveCount(0);
  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);
  // The left nav and the hub both have the page.
  await expect(page.getByRole("link", { name: "Library books" }).first()).toBeVisible();
});

test("search and item level narrow the list, live in the URL and reset", async ({ page }) => {
  await page.goto(LIBRARY);
  const books = page.getByTestId("library-book");
  await expect(books).toHaveCount(ALL_BOOKS);

  await page.getByTestId("library-search").fill("antonidas archmage");
  await expect(books).toHaveCount(1);
  await expect(page).toHaveURL(/q=antonidas/);

  await page.getByTestId("library-search").fill("");
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

  // A shared link opens with its filters on.
  await page.goto(`${LIBRARY}?ilvl=60`);
  await expect(books).toHaveCount(sixties);
});

test("ticking a book as found survives a reload, hides with Hide found and clears", async ({ page }) => {
  await page.goto(LIBRARY);
  const books = page.getByTestId("library-book");
  await expect(books).toHaveCount(ALL_BOOKS);
  await page.getByLabel("Found: Archmage Antonidas: The Unabridged Autobiography").check();
  await expect(page.getByTestId("library-count")).toHaveText(`${ALL_BOOKS} books · 1 of ${ALL_BOOKS} found`);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), CHECKLIST_KEY)).toBe('["203754"]');

  await page.reload();
  await expect(page.getByLabel("Found: Archmage Antonidas: The Unabridged Autobiography")).toBeChecked();
  await expect(page.getByTestId("library-count")).toHaveText(`${ALL_BOOKS} books · 1 of ${ALL_BOOKS} found`);

  await page.getByTestId("library-hide-found").click();
  await expect(page.getByTestId("library-hide-found")).toHaveAttribute("aria-pressed", "true");
  await expect(books).toHaveCount(ALL_BOOKS - 1);
  await expect(page).toHaveURL(/hide=1/);
  await page.getByTestId("library-hide-found").click();
  await expect(books).toHaveCount(ALL_BOOKS);

  await page.getByRole("button", { name: "Clear found" }).click();
  await expect(page.getByTestId("library-count")).toHaveText(`${ALL_BOOKS} books · 0 of ${ALL_BOOKS} found`);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), CHECKLIST_KEY)).toBeNull();
});

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("the page fits a phone with 44px controls and no sideways scroll", async ({ page }) => {
    await page.goto(LIBRARY);
    await expect(page.getByTestId("library-book")).toHaveCount(ALL_BOOKS);
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
    for (const control of [
      page.getByTestId("library-search"),
      page.getByTestId("library-level-chip").first(),
      page.getByLabel("Found: Archmage Antonidas: The Unabridged Autobiography").locator("xpath=.."),
    ]) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test("the skeleton shows while the books load, then the list replaces it", async ({ page }) => {
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
  await expect(page.getByTestId("library-book").first()).toBeVisible();
});
