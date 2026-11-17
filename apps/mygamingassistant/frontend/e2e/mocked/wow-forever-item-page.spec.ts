/**
 * WoW Forever item pages (`/wow-forever/items/:id`) — static, frontend-only.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-item-page
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const PHONE = { width: 375, height: 812 };

function howToGet(page: Page) {
  return page.getByRole("region", { name: "How to get it" });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("opens an item page from Best gear, shows how to get it, and goes back", async ({ page }) => {
  await page.goto("/wow-forever/gear");
  await page.getByRole("radio", { name: "Level 60 (pre-raid)" }).click();
  const row = page.getByTestId("gear-item-row").filter({ hasText: "Felcloth Gloves" });
  await row.getByRole("link", { name: "Felcloth Gloves" }).click();

  await expect(page).toHaveURL(/\/wow-forever\/items\/\d+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Felcloth Gloves" })).toBeVisible();
  await expect(page.getByTestId("item-stats")).toContainText("Item Level");
  const sources = howToGet(page);
  await expect(sources.getByRole("heading", { level: 3, name: "Crafted" })).toBeVisible();
  await expect(sources.getByTestId("provenance-badge").first()).toHaveAttribute("data-provenance", "client");
  await expect(sources.getByRole("link", { name: "Crafting guide" })).toHaveAttribute("href", /\/wow-forever\/professions\?p=tailoring&skill=\d+/);
  // Where to learn it: the pattern, linked to its own page with its icon, then where the pattern comes from.
  const learn = sources.getByTestId("crafted-learn");
  await expect(learn.getByRole("link", { name: "Pattern: Felcloth Gloves" })).toHaveAttribute("href", /\/wow-forever\/items\/\d+$/);
  await expect(learn.getByRole("link", { name: "Pattern: Felcloth Gloves" }).locator("img, [data-testid=game-icon-placeholder]")).toBeVisible();
  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);

  await page.getByRole("link", { name: "Back to Best gear" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/gear/);
  await expect(page.getByTestId("gear-item-row").first()).toBeVisible();
});

// Felcloth Gloves (bind on equip): its materials at 1s each, the gloves 1g and their pattern 5g.
const FELCLOTH_PRICES: [number, number, string][] = [
  [14048, 100, "Bolt of Runecloth"],
  [14256, 100, "Felcloth"],
  [12662, 100, "Demonic Rune"],
  [12808, 100, "Essence of Undeath"],
  [14341, 100, "Rune Thread"],
  [18415, 50000, "Pattern: Felcloth Gloves"],
  [18407, 10000, "Felcloth Gloves"],
];

test("a crafted item shows its auction prices: each material, one craft's worth, the item, which is cheaper, and the pattern", async ({ page }) => {
  await page.route(/\/wow\/prices(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        region: "us",
        server: "pvp",
        faction: "alliance",
        source_updated_at: "2026-11-17T09:00:00Z",
        fetched_at: "2026-11-17T09:00:00Z",
        columns: ["item_id", "market_value", "min_buyout", "quantity", "listings", "name"],
        items: FELCLOTH_PRICES.map(([id, value, name]) => [id, value, value, 20, 4, name]),
      }),
    }),
  );
  await page.goto("/wow-forever/items/18407");
  await expect(page.getByRole("heading", { level: 1, name: "Felcloth Gloves" })).toBeVisible();
  const sources = howToGet(page);
  await expect(sources.getByText("(~20s for 20)")).toBeVisible();
  const prices = sources.getByTestId("crafted-prices");
  // 12 + 20 + 6 + 8 + 2 materials at 1s: ~48s.
  await expect(prices.getByText("Materials for one craft")).toBeVisible();
  await expect(prices.getByText("~48s", { exact: true })).toBeVisible();
  await expect(prices.getByText("Pattern: Felcloth Gloves at the auction house")).toBeVisible();
  await expect(prices.getByText("~5g", { exact: true })).toBeVisible();
  await expect(prices.getByText("Buy one at the auction house")).toBeVisible();
  await expect(prices.getByText("~1g", { exact: true })).toBeVisible();
  await expect(prices.getByText("Cheaper to craft: saves ~52s per craft.")).toBeVisible();

  await page.setViewportSize(PHONE);
  await expectNoHorizontalOverflow(page);
});

test("lists a dungeon boss drop with its chance, labelled Classic, with directions to the door", async ({ page }) => {
  await page.goto("/wow-forever/items/11815");
  await expect(page.getByRole("heading", { level: 1, name: "Hand of Justice" })).toBeVisible();
  const sources = howToGet(page);
  const dungeon = sources.getByRole("region", { name: "Dungeon drop" });
  await expect(dungeon).toContainText(/Emperor Dagran Thaurissan · boss, level \d+ · 19\.8%/);
  await expect(dungeon).toContainText("Blackrock Depths");
  await expect(dungeon.getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "classic");
  await dungeon.getByRole("link", { name: "Directions to Blackrock Depths entrance" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?to=pt%3A.+&dir=1/);
});

test("a quest reward lists the quest and its giver", async ({ page }) => {
  await page.goto("/wow-forever/items/2042");
  await expect(page.getByRole("heading", { level: 1, name: "Staff of Westfall" })).toBeVisible();
  const quest = howToGet(page).getByRole("region", { name: "Quest reward" });
  await expect(quest).toContainText("The Defias Brotherhood");
  await expect(quest.getByRole("link", { name: /^Directions to / }).first()).toBeVisible();
});

test("a Classic item Forever hasn't shown yet says so and offers a search", async ({ page }) => {
  await page.goto("/wow-forever/items/913");
  await expect(page.getByTestId("item-not-found")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Huge Ogre Sword" })).toBeVisible();
  await expect(page.getByText(/hasn't appeared in WoW Forever's game files yet/)).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Find an item" });
  await search.fill("Hand of Justice");
  await page.getByRole("link", { name: "Hand of Justice" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/items\/11815$/);
  await expect(page.getByRole("heading", { level: 1, name: "Hand of Justice" })).toBeVisible();
});

test("an unknown item id is not found", async ({ page }) => {
  await page.goto("/wow-forever/items/9999999");
  await expect(page.getByRole("heading", { level: 1, name: "Item not found" })).toBeVisible();
});

test("fits a 375px phone with no sideways scrolling", async ({ page }) => {
  await page.setViewportSize(PHONE);
  for (const id of [11815, 13047, 14152, 913]) {
    await page.goto(`/wow-forever/items/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("item-page-skeleton")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  }
});
