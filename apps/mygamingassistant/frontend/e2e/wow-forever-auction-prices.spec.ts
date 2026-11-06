/**
 * WoW Forever auction-house prices on the pages, with GET /api/wow/prices stubbed.
 *
 * The prices are filled in automatically, so nothing here types a price. It checks:
 *   - Tailoring and Enchanting show a cheapest route with a total, and the TSM credit
 *   - a material the source has no price for is labelled "No auction price"
 *   - a guide without a cheapest route (Alchemy) still shows costs, with no prices panel
 *   - the Cooking route prices its materials
 *   - a food page: buy or cook, ingredient prices, the recipe's price
 *   - the food picker sums up each pick
 *   - prices that fail to load leave the route usable, with a retry
 *   - nothing scrolls sideways at 375px
 *
 * Run: npm run test:e2e -- wow-forever-auction-prices
 */
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

const PRICES = "**/wow/prices?region=*";
const COLUMNS = ["item_id", "market_value", "avg_sale_price", "historical", "sold_per_day", "name"];
const UPDATED_AT = "2026-11-06T09:00:00Z";
const NOW = new Date("2026-11-06T12:00:00Z");
/** The one Enchanting material the stub leaves out, so its "no auction price" label can be checked. */
const LARGE_BRILLIANT_SHARD = 14344;

interface Reagent {
  id: number;
  name: string;
}

function reagentsOf(file: string): Reagent[] {
  const url = new URL(`../src/games/wow-forever/data/professions/crafting/${file}.json`, import.meta.url);
  const data = JSON.parse(readFileSync(url, "utf-8")) as { recipes: { reagents: Reagent[] }[] };
  return data.recipes.flatMap((r) => r.reagents);
}

type Row = [number, number, string];

/** Every material these guides use, at 50c, minus Large Brilliant Shard. */
function craftingRows(): Row[] {
  const seen = new Map<number, string>();
  for (const file of ["tailoring", "enchanting", "alchemy"]) for (const r of reagentsOf(file)) seen.set(r.id, r.name);
  seen.delete(LARGE_BRILLIANT_SHARD);
  return [...seen].map(([id, name]) => [id, 50, name]);
}

const FOOD_ROWS: Row[] = [
  [3173, 40, "Bear Meat"],
  [6890, 150, "Smoked Bear Meat"],
  [6892, 2500, "Recipe: Smoked Bear Meat"],
  [2672, 15, "Stringy Wolf Meat"],
  [769, 12, "Chunk of Boar Meat"],
];

async function stubPrices(page: Page, rows: Row[]) {
  await page.route(PRICES, (route) => {
    const region = new URL(route.request().url()).searchParams.get("region") ?? "us";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        region,
        credit: { source: "tsm", name: "TradeSkillMaster", url: "https://www.tradeskillmaster.com" },
        source_updated_at: UPDATED_AT,
        fetched_at: UPDATED_AT,
        columns: COLUMNS,
        items: rows.map(([id, value, name]) => [id, value, null, value, null, name]),
      }),
    });
  });
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test("Tailoring finds the cheapest route at auction prices and totals it, with nothing typed", async ({ page }) => {
  await stubPrices(page, craftingRows());
  await page.goto("/wow-forever/professions?p=tailoring");
  const route = page.locator("#route");
  const credit = route.getByTestId("price-credit");
  await expect(credit).toContainText("Prices from TradeSkillMaster · updated 3 hours ago");
  await expect(credit.getByRole("link", { name: "TradeSkillMaster" })).toHaveAttribute("href", "https://www.tradeskillmaster.com");
  await expect(route.getByText("Cheapest at auction prices")).toBeVisible();
  // 265-300 is a "pick what you can get" row, so the total stops there.
  await expect(route.getByText(/^Estimated cost to reach skill 265: ~\d+g.*Past that, you pick a recipe, so it isn't counted\.$/)).toBeVisible();
  await expect(route.getByText(/^Auction prices for \d+ of \d+ materials\.$/)).toBeVisible();
  await expect(page.getByRole("textbox").filter({ hasText: /./ })).toHaveCount(0);

  const shopping = page.locator("#shopping");
  await shopping.locator("summary").first().click();
  await expect(shopping.getByTestId("shopping-total")).toContainText("All of it at auction prices: ~");
});

test("Enchanting totals its route and labels the material with no auction price", async ({ page }) => {
  await stubPrices(page, craftingRows());
  await page.goto("/wow-forever/professions?p=enchanting");
  const route = page.locator("#route");
  await expect(route.getByText("Cheapest at auction prices")).toBeVisible();
  await expect(route.getByText(/^Estimated cost to (reach skill )?\d+: ~/)).toBeVisible();

  await route.getByRole("button", { name: /^Prices/ }).click();
  await route.getByText(/^More materials other recipes use/).click();
  const shard = route.getByLabel("Large Brilliant Shard");
  await expect(shard).toHaveValue("");
  await expect(shard.locator("xpath=..").getByText("No auction price")).toBeVisible();
  const dust = route.getByLabel("Strange Dust");
  await expect(dust).toHaveAttribute("placeholder", "50c");
  await expect(dust.locator("xpath=..").getByText("Auction price 50c")).toBeVisible();
});

test("Alchemy shows costs on its hand-picked route, without a prices panel or a cheapest claim", async ({ page }) => {
  await stubPrices(page, craftingRows());
  await page.goto("/wow-forever/professions?p=alchemy");
  const route = page.locator("#route");
  await expect(route.getByTestId("price-credit")).toBeVisible();
  await expect(route.getByText(/^Estimated cost to (reach skill )?\d+: ~/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Prices", exact: true })).toHaveCount(0);
  await expect(route.getByText(/cheapest/i)).toHaveCount(0);
});

test("prices that don't load leave the route usable, with a retry", async ({ page }) => {
  let fail = true;
  // Registered first, so it runs after the failing route below hands over with fallback().
  await stubPrices(page, craftingRows());
  await page.route(PRICES, (route) => (fail ? route.fulfill({ status: 503, body: "" }) : route.fallback()));
  await page.goto("/wow-forever/professions?p=tailoring");
  const route = page.locator("#route");
  await expect(route.getByText("Couldn't load prices — showing routes without prices.")).toBeVisible();
  await expect(route.getByText("Default route")).toBeVisible();
  fail = false;
  await route.getByRole("button", { name: "Try again" }).click();
  await expect(route.getByText("Cheapest at auction prices")).toBeVisible();
});

test("the Cooking route prices its materials", async ({ page }) => {
  await stubPrices(page, FOOD_ROWS);
  await page.goto("/wow-forever/professions?p=cooking");
  await expect(page.getByTestId("price-credit").first()).toContainText("Prices from TradeSkillMaster");
  await expect(page.getByTestId("auction-price").first()).toHaveText(/\(~\d+[gsc].* each\)/);
});

test("a food page says whether to buy or cook, from auction prices", async ({ page }) => {
  await stubPrices(page, FOOD_ROWS);
  await page.goto("/wow-forever/food/6890");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Buy or cook?" }) });
  await expect(section.getByTestId("price-credit")).toContainText("Prices from TradeSkillMaster · updated 3 hours ago");
  const prices = section.getByTestId("food-prices");
  await expect(prices).toContainText("Ingredients for one cook~40c");
  await expect(prices).toContainText("Buy Smoked Bear Meat at the auction house~1s 50c");
  await expect(prices).toContainText("Cheaper to cook: saves ~1s 10c on each one.");
  await expect(prices).toContainText("The recipe (Recipe: Smoked Bear Meat)~25s");
  const reagents = page.locator("section", { has: page.getByRole("heading", { name: "What you need" }) });
  await expect(reagents.getByTestId("auction-price")).toHaveText("(~40c each)");
});

test("a food with an ingredient the auction house doesn't price labels it", async ({ page }) => {
  await stubPrices(page, FOOD_ROWS);
  await page.goto("/wow-forever/food/2680"); // Spiced Wolf Meat: Stringy Wolf Meat + Mild Spices
  const prices = page.getByTestId("food-prices");
  await expect(prices).toContainText("plus Mild Spices (no auction price)");
  await expect(prices).toContainText("Buy Spiced Wolf Meat at the auction houseno auction price");
});

test("the food picker sums up each pick", async ({ page }) => {
  await stubPrices(page, FOOD_ROWS);
  await page.goto("/wow-forever/food?lvl=20&class=warlock&act=healing&skill=1");
  await expect(page.getByTestId("price-credit")).toBeVisible();
  await expect(page.getByTestId("food-price-line").first()).toContainText(/^Cook .* · Buy /);
});

test("priced pages never scroll sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await stubPrices(page, [...craftingRows(), ...FOOD_ROWS]);
  for (const path of ["/wow-forever/professions?p=tailoring&skill=150", "/wow-forever/professions?p=enchanting", "/wow-forever/food/6890"]) {
    await page.goto(path);
    await expect(page.getByTestId("price-credit").first()).toBeVisible();
    await expectNoSidewaysScroll(page);
  }
  await page.goto("/wow-forever/professions?p=enchanting");
  await page.locator("#route").getByRole("button", { name: /^Prices/ }).click();
  await expectNoSidewaysScroll(page);
});
