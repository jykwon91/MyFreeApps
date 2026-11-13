/**
 * WoW Forever auction-house prices on the pages, with GET /api/wow/prices stubbed.
 *
 * The prices are filled in automatically, so nothing here types a price. It checks:
 *   - Tailoring and Enchanting show a cheapest route with a total, and the Blizzard credit
 *     for the PvP server's auction house of your faction (US) with no region or server
 *     picker — prices are US only and only the PvP server is mapped
 *   - the Auction house page switches between the Alliance, Horde and Blackwater houses
 *     (each asked for as server=pvp), and the faction you pick carries over to the other
 *     priced pages
 *   - every priced material shows its price filled in; one nobody sells yet is
 *     worked out from its materials ("From its materials") or says it isn't sold yet
 *   - route lines show what one of each material costs ("50c each")
 *   - your own price overrides one, and "Use auction price" puts it back
 *   - a guide without a cheapest route (Alchemy) still shows costs, with no prices panel
 *   - the Cooking route prices its materials
 *   - a food page: buy or cook, ingredient prices, the recipe's price
 *   - the food picker sums up each pick
 *   - prices that fail to load leave the route usable, with a retry
 *   - the Auction house page narrows to one profession's materials, and prices one recipe
 *     (each material, the total, what it sells for, the difference) from its link
 *   - the Auction house page filters by quality, price and units on sale, keeps every filter in
 *     its link (a deep link opens the filtered view, Back undoes a change), and on a phone opens
 *     them in a bottom sheet that doesn't scroll sideways
 *   - the Auction house page filters by item category (Trade Goods, then Metal & Stone), loading
 *     the item categories only once a category is picked, and keeps both in its link
 *   - the Auction house top-picks filter (Gear group) keeps only the top three items per slot for the
 *     player's class, tags each with its rank and slot, narrows to one rank from a chip, and loads the
 *     item list and gear data only once it is on
 *   - "Download the addon" zips MGA Prices with every house's prices in Data.lua, plus crafting demand per material
 *   - nothing scrolls sideways at 375px
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-auction-prices
 */
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

/** The price list only, not "Refresh now" (/wow/prices/refresh). */
const PRICES = /\/wow\/prices(\?|$)/;
const COLUMNS = ["item_id", "market_value", "min_buyout", "quantity", "listings", "name"];
const UPDATED_AT = "2026-11-06T09:00:00Z";
const NOW = new Date("2026-11-06T12:00:00Z");
/** Enchanting materials the stub leaves out: one nothing can price, one worked out from what Blacksmithing makes it with. */
const LARGE_BRILLIANT_SHARD = 14344;
const GOLDEN_ROD = 11128;

interface Reagent {
  id: number;
  name: string;
}

function reagentsOf(file: string): Reagent[] {
  const url = new URL(`../../src/games/wow-forever/data/professions/crafting/${file}.json`, import.meta.url);
  const data = JSON.parse(readFileSync(url, "utf-8")) as { recipes: { reagents: Reagent[] }[] };
  return data.recipes.flatMap((r) => r.reagents);
}

type Row = [number, number, string];

/** Golden Rod = 1 Gold Bar + 2 Coarse Grinding Stone, at 50c each = 1s 50c. */
const ROD_MATERIALS: Row[] = [
  [3577, 50, "Gold Bar"],
  [3478, 50, "Coarse Grinding Stone"],
];

/** Every material these guides use, at 50c, minus Large Brilliant Shard and Golden Rod (plus what Golden Rod is made of). */
function craftingRows(): Row[] {
  const seen = new Map<number, string>();
  for (const file of ["tailoring", "enchanting", "alchemy"]) for (const r of reagentsOf(file)) seen.set(r.id, r.name);
  seen.delete(LARGE_BRILLIANT_SHARD);
  seen.delete(GOLDEN_ROD);
  for (const [id, , name] of ROD_MATERIALS) seen.set(id, name);
  return [...seen].map(([id, name]) => [id, 50, name]);
}

const FOOD_ROWS: Row[] = [
  [3173, 40, "Bear Meat"],
  [6890, 150, "Smoked Bear Meat"],
  [6892, 2500, "Recipe: Smoked Bear Meat"],
  [2672, 15, "Stringy Wolf Meat"],
  [769, 12, "Chunk of Boar Meat"],
];

function priceBody(rows: Row[], faction: string) {
  return {
    region: "us",
    server: "pvp",
    faction,
    source_updated_at: UPDATED_AT,
    fetched_at: UPDATED_AT,
    columns: COLUMNS,
    items: rows.map(([id, value, name]) => [id, value, value, 20, 4, name]),
  };
}

/** Serves `rowsFor(faction)` for whichever house the page asks for; records each "server/faction" asked. */
async function stubFactionPrices(page: Page, rowsFor: (faction: string) => Row[], asked: string[] = []) {
  await page.route(PRICES, (route) => {
    const faction = new URL(route.request().url()).searchParams.get("faction") ?? "alliance";
    asked.push(`${new URL(route.request().url()).searchParams.get("server")}/${faction}`);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(priceBody(rowsFor(faction), faction)) });
  });
}

async function stubPrices(page: Page, rows: Row[]) {
  await stubFactionPrices(page, () => rows);
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test("Tailoring finds the cheapest route at auction prices and totals it, with nothing typed", async ({ page }) => {
  await stubPrices(page, craftingRows());
  await page.goto("/wow-forever/professions?p=tailoring");
  const route = page.locator("#route");
  const credit = route.getByTestId("price-credit");
  await expect(credit).toContainText("Prices from Blizzard (PvP · Alliance AH, US) · updated 3 hours ago");
  await expect(credit.getByRole("link")).toHaveCount(0);
  // US only: no region picker.
  await expect(credit.getByRole("combobox", { name: "Region" })).toHaveCount(0);
  await expect(route.getByText("Cheapest at auction prices")).toBeVisible();
  // 265-300 is a "pick what you can get" row, so the total stops there.
  await expect(route.getByText(/^Estimated cost to reach skill 265: ~\d+g.*Past that, you pick a recipe, so it isn't counted\.$/)).toBeVisible();
  await expect(route.getByText(/^Priced \d+ of \d+ materials automatically\.$/)).toBeVisible();
  await expect(page.getByRole("textbox").filter({ hasText: /./ })).toHaveCount(0);

  const shopping = page.locator("#shopping");
  await shopping.locator("summary").first().click();
  await expect(shopping.getByTestId("shopping-total")).toContainText("All of it at auction prices: ~");
});

test("Enchanting fills in every price it can, works out what nobody sells yet, and prices each route line", async ({ page }) => {
  await stubPrices(page, craftingRows());
  await page.goto("/wow-forever/professions?p=enchanting");
  const route = page.locator("#route");
  await expect(route.getByText("Cheapest at auction prices")).toBeVisible();
  await expect(route.getByText(/^Estimated cost to (reach skill )?\d+: ~/)).toBeVisible();
  await expect(route.getByText(/ · 50c each$/).first()).toBeVisible();

  await route.getByRole("button", { name: /^Prices/ }).click();
  await expect(route.getByText(/^Priced \d+ of \d+ automatically$/)).toBeVisible();
  await route.getByText(/^More materials other recipes use/).click();
  const dust = route.getByLabel("Strange Dust");
  await expect(dust).toHaveValue("50c");
  await expect(dust.locator("xpath=..").getByText("Auction house")).toBeVisible();
  const rod = route.getByLabel("Golden Rod");
  await expect(rod).toHaveValue("1s 50c");
  await expect(rod.locator("xpath=..").getByText("From its materials")).toBeVisible();
  const shard = route.getByLabel("Large Brilliant Shard");
  await expect(shard).toHaveValue("");
  await expect(shard.locator("xpath=..").getByText(/^Not on the auction house yet — fills in automatically once it sells$/)).toBeVisible();
  await expect(route.getByText(/e\.g\. 1g/)).toHaveCount(0);

  // Your own price overrides the auction one, and one click puts the auction price back.
  await dust.fill("1g");
  await dust.blur();
  await expect(dust.locator("xpath=..").getByText("= 1g · your price")).toBeVisible();
  await expect(route.getByText(/1 you set yourself/)).toBeVisible();
  await dust.locator("xpath=..").getByRole("button", { name: "Use auction price (50c)" }).click();
  await expect(dust).toHaveValue("50c");
  await expect(route.getByText(/you set yourself/)).toHaveCount(0);
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
  await expect(page.getByTestId("price-credit").first()).toContainText("Prices from Blizzard (PvP · Alliance AH, US)");
  await expect(page.getByTestId("auction-price").first()).toHaveText(/\(~\d+[gsc].* each\)/);
});

test("a food page says whether to buy or cook, from auction prices", async ({ page }) => {
  await stubPrices(page, FOOD_ROWS);
  await page.goto("/wow-forever/food/6890");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Buy or cook?" }) });
  await expect(section.getByTestId("price-credit")).toContainText("Prices from Blizzard (PvP · Alliance AH, US) · updated 3 hours ago");
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

const BLUE_PEARL_BY_FACTION: Record<string, Row[]> = {
  alliance: [[4611, 3300, "Blue Pearl"]],
  horde: [[4611, 3495, "Blue Pearl"]],
  neutral: [[4611, 5349, "Blue Pearl"]],
};

test("the Auction house page switches between each faction's prices, and the pick carries over", async ({ page }) => {
  const asked: string[] = [];
  await stubFactionPrices(page, (faction) => BLUE_PEARL_BY_FACTION[faction] ?? [], asked);
  await page.goto("/wow-forever/auction-house?q=Blue+Pearl");
  const house = page.getByRole("radiogroup", { name: "Auction house" });
  const pearl = page.getByTestId("auction-row").filter({ hasText: "Blue Pearl" });
  await expect(house.getByRole("radio", { name: "Alliance" })).toHaveAttribute("aria-checked", "true");
  await expect(pearl.getByTestId("auction-market")).toHaveText("33s");
  await expect(pearl.getByTestId("auction-on-sale")).toHaveText("20 in 4 auctions");
  await expect(page.getByTestId("price-credit")).toContainText("Prices from Blizzard (PvP · Alliance AH, US) · updated 3 hours ago");

  await house.getByRole("radio", { name: "Horde" }).click();
  await expect(pearl.getByTestId("auction-market")).toHaveText("34s 95c");
  await expect(page.getByTestId("price-credit")).toContainText("(PvP · Horde AH, US)");
  await expect(page).toHaveURL(/\?q=Blue\+Pearl$/);

  await house.getByRole("radio", { name: "Blackwater" }).click();
  await expect(pearl.getByTestId("auction-market")).toHaveText("53s 49c");
  await expect(page).toHaveURL(/house=neutral/);
  expect(asked).toEqual(expect.arrayContaining(["pvp/alliance", "pvp/horde", "pvp/neutral"]));

  // Horde was saved as your faction; Blackwater lives only in this page's link.
  await page.goto("/wow-forever/food/6890");
  await expect(page.getByTestId("price-credit").first()).toContainText("Prices from Blizzard (PvP · Horde AH, US)");
});

test("an auction house with no prices yet says so plainly", async ({ page }) => {
  await stubFactionPrices(page, () => []);
  await page.goto("/wow-forever/auction-house");
  await expect(page.getByTestId("price-credit")).toContainText("No PvP · Alliance auction prices yet.");
  await expect(page.getByTestId("auction-row")).toHaveCount(0);
});

/** Runed Copper Rod (spell 7421) = 1 Copper Rod + 1 Mote of Magic. */
const ROD_RECIPE_ROWS: Row[] = [
  [6217, 150, "Copper Rod"],
  [247786, 250, "Mote of Magic"],
  [6218, 1000, "Runed Copper Rod"],
  [2589, 10, "Linen Cloth"],
];

test("the Auction house page narrows to a profession's materials and prices one recipe", async ({ page }) => {
  await stubPrices(page, ROD_RECIPE_ROWS);
  await page.goto("/wow-forever/auction-house");
  await page.getByTestId("auction-profession").selectOption("enchanting");
  await expect(page).toHaveURL(/prof=enchanting/);
  await expect(page.getByTestId("auction-results-note")).toContainText(/^2 Enchanting materials on sale · \d+ more have no auctions right now$/);
  await expect(page.getByTestId("auction-row").filter({ hasText: "Linen Cloth" })).toHaveCount(0);

  await page.getByTestId("recipe-finder").fill("runed copper");
  await page.getByRole("button", { name: "Runed Copper Rod (5)" }).click();
  await expect(page).toHaveURL(/recipe=7421/);
  const panel = page.getByTestId("recipe-panel");
  await expect(panel.getByRole("heading", { name: "Runed Copper Rod" })).toBeVisible();
  await expect(panel.getByTestId("recipe-material")).toHaveCount(2);
  await expect(page.getByTestId("recipe-materials-cost")).toContainText("4s");
  await expect(page.getByTestId("recipe-sells-for")).toContainText("10s each");
  await expect(page.getByTestId("recipe-profit")).toContainText("+6s");

  await page.goBack();
  await expect(page.getByTestId("recipe-finder")).toBeVisible();
  await page.goForward();
  await page.getByTestId("recipe-back").click();
  await expect(page).not.toHaveURL(/recipe=/);
});

/** Linen Cloth (common), Gold Bar (uncommon) and an item the icon map calls rare, with different prices and stock. */
const FILTER_ROWS: [number, number, number, number, string][] = [
  [2589, 10, 500, 12, "Linen Cloth"],
  [3577, 5000, 5, 2, "Gold Bar"],
  [720, 200000, 1, 1, "Rare Test Item"],
];

async function stubFilterPrices(page: Page) {
  await page.route(PRICES, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...priceBody([], "alliance"),
        items: FILTER_ROWS.map(([id, value, quantity, listings, name]) => [id, value, value, quantity, listings, name]),
      }),
    }),
  );
}

/** The row names once the list has settled on `count` rows (the prices load, then the filters apply). */
async function rowNames(page: Page, count: number): Promise<string[]> {
  await expect(page.getByTestId("auction-row")).toHaveCount(count);
  return page.getByTestId("auction-item-name").allTextContents();
}

test("the Auction house page filters by quality, price and units on sale, and Back leaves it in one step", async ({ page }) => {
  await stubFilterPrices(page);
  await page.goto("/wow-forever");
  await page.goto("/wow-forever/auction-house");
  await expect(page.getByTestId("auction-row")).toHaveCount(3);
  await page.getByTestId("auction-filters-button").click();
  const panel = page.getByTestId("auction-filter-panel");

  await panel.getByTestId("auction-filter-quality").getByRole("button", { name: "Uncommon" }).click();
  await expect(page).toHaveURL(/quality=uncommon/);
  expect(await rowNames(page, 1)).toEqual(["Gold Bar"]);
  await expect(page.getByTestId("auction-results-note")).toContainText("1 item match");
  await expect(page.getByTestId("auction-filters-count")).toHaveText("1");

  await panel.getByTestId("auction-filter-quality").getByRole("button", { name: "Uncommon" }).click();
  await panel.getByTestId("auction-filter-quantity").getByRole("button", { name: "100+" }).click();
  await expect(page).toHaveURL(/qty=100/);
  expect(await rowNames(page, 1)).toEqual(["Linen Cloth"]);

  await panel.getByLabel("From gold").fill("1");
  await expect(page).toHaveURL(/min=1/);
  await expect(page.getByTestId("auction-row")).toHaveCount(0);
  await expect(page.getByText(/No items match/)).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByTestId("auction-row")).toHaveCount(3);
  await expect(page).not.toHaveURL(/qty=|min=|quality=/);

  // Filter changes replace the history entry, so one Back leaves for the page before, not through each change.
  await panel.getByTestId("auction-filter-quantity").getByRole("button", { name: "10+" }).click();
  await expect(page).toHaveURL(/qty=10/);
  await page.goBack();
  await expect(page).toHaveURL(/\/wow-forever$/);
});

const ITEM_CATEGORIES = "**/itemCategories*.json";

/** Linen Cloth is Trade Goods > Cloth, Gold Bar is Trade Goods > Metal & Stone, the rare test item a Potion. */
const CATEGORIES_FILE = {
  source: "test",
  clientBuild: "1.60.1.70888",
  attribution: "test",
  subclasses: { "0.1": "Potions", "7.5": "Cloth", "7.7": "Metal & Stone" },
  items: { "0.1": [720], "7.5": [2589], "7.7": [3577] },
};

test("the Auction house page filters by category and subclass, and loads the categories only when one is picked", async ({ page }) => {
  await stubFilterPrices(page);
  let categoryRequests = 0;
  await page.route(ITEM_CATEGORIES, (route) => {
    categoryRequests += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(CATEGORIES_FILE) });
  });
  await page.goto("/wow-forever/auction-house");
  await expect(page.getByTestId("auction-row")).toHaveCount(3);
  await page.getByTestId("auction-filters-button").click();
  const panel = page.getByTestId("auction-filter-panel");
  expect(categoryRequests).toBe(0);

  await panel.getByTestId("auction-filter-category").getByRole("button", { name: "Trade Goods" }).click();
  await expect(page).toHaveURL(/cat=trade-goods/);
  expect(await rowNames(page, 2)).toEqual(["Linen Cloth", "Gold Bar"]);
  const kinds = panel.getByTestId("auction-filter-subcategory");
  await expect(kinds.getByRole("button")).toHaveText(["All trade goods", "Cloth", "Metal & Stone"]);

  await kinds.getByRole("button", { name: "Metal & Stone" }).click();
  await expect(page).toHaveURL(/cat=trade-goods&sub=7/);
  expect(await rowNames(page, 1)).toEqual(["Gold Bar"]);
  await expect(page.getByRole("button", { name: "Remove filter: Category: Metal & Stone" })).toBeVisible();
  expect(categoryRequests).toBe(1);

  await page.getByRole("button", { name: "Remove filter: Category: Metal & Stone" }).click();
  await expect(page).not.toHaveURL(/cat=|sub=/);
  await expect(page.getByTestId("auction-row")).toHaveCount(3);
});

const ITEMS_FILE = "**/items*.json*";
const ITEM_COLUMNS = ["id", "name", "quality", "slot", "itemType", "itemLevel", "requiredLevel", "armor", "weapon", "stats", "classes", "damageUnknown", "otherEffects"];

function neckRow(id: number, name: string, spellDamage: number): unknown[] {
  return [id, name, "rare", "neck", null, 60, 0, null, null, { spell_damage: spellDamage }, null, 0, 0];
}

/** Necks for a Warlock at level 60: Rare Test Item (50, #1), a filler (48, #2), Gold Bar (45, #3) and another filler (40, out). */
const ITEMS_STUB = {
  source: "test",
  clientBuild: "1.60.1.70888",
  attribution: "test",
  columns: ITEM_COLUMNS,
  items: [neckRow(720, "Rare Test Item", 50), neckRow(9000001, "Filler Neck", 48), neckRow(3577, "Gold Bar", 45), neckRow(9000002, "Other Neck", 40)],
};

test("the Auction house top-picks filter keeps the top three per slot, tags them, and narrows to one rank", async ({ page }) => {
  await stubFilterPrices(page);
  let itemRequests = 0;
  await page.route(ITEMS_FILE, (route) => {
    // Only the page's fetch of the file; the dev server's own module imports of it pass through.
    if (route.request().resourceType() !== "fetch") return route.fallback();
    itemRequests += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ITEMS_STUB) });
  });
  await page.goto("/wow-forever/auction-house");
  await expect(page.getByTestId("auction-row")).toHaveCount(3);
  expect(itemRequests).toBe(0);
  // The top picks sit on the page itself, not inside the Filters panel.
  const bis = page.getByTestId("auction-filter-bis");
  await expect(bis.getByRole("button")).toHaveText(["Off", "Any top 3", "#1", "#2", "#3"]);

  await bis.getByRole("button", { name: "Any top 3" }).click();
  await expect(page).toHaveURL(/bis=any/);
  expect(await rowNames(page, 2)).toEqual(["Gold Bar", "Rare Test Item"]);
  await expect(page.getByTestId("auction-bis-badge")).toHaveText(["#3 Neck", "#1 Neck"]);
  await expect(page.getByRole("button", { name: "Remove filter: Top 3 BiS for level 60 Affliction Warlock" })).toBeVisible();

  await bis.getByRole("button", { name: "#3" }).click();
  await expect(page).toHaveURL(/bis=3/);
  expect(await rowNames(page, 1)).toEqual(["Gold Bar"]);

  await page.getByRole("button", { name: /^Remove filter: #3 BiS/ }).click();
  await expect(page).not.toHaveURL(/bis=/);
  await expect(page.getByTestId("auction-row")).toHaveCount(3);
  await expect(page.getByTestId("auction-bis-badge")).toHaveCount(0);
});

test("the Auction house's Gear for card picks a class and a level on the page, and fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await stubFilterPrices(page);
  await page.route(ITEMS_FILE, (route) =>
    route.request().resourceType() === "fetch"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ITEMS_STUB) })
      : route.fallback(),
  );
  await page.goto("/wow-forever/auction-house");
  const card = page.getByTestId("auction-gear-for");
  await expect(card).toBeVisible();
  const gearFor = card.getByLabel("Gear for");
  await expect(gearFor).toHaveValue("");

  await gearFor.selectOption("warrior");
  await expect(page).toHaveURL(/class=warrior/);
  await expect(page.getByRole("button", { name: "Remove filter: Usable by Warrior" })).toBeVisible();

  await card.getByLabel("Level").fill("39");
  await card.getByLabel("Level").press("Enter");
  await expect(page).toHaveURL(/bis=any/);
  await expect(page).toHaveURL(/bisLvl=39/);
  await expect(page.getByRole("button", { name: "Remove filter: Top 3 for level 39 Warrior" })).toBeVisible();

  const box = await card.boundingBox();
  expect(box && box.x + box.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("a link to a filtered Auction house view opens it filtered, with the filters shown", async ({ page }) => {
  await stubFilterPrices(page);
  await page.goto("/wow-forever/auction-house?quality=rare,uncommon&max=10&sort=high");
  expect(await rowNames(page, 1)).toEqual(["Gold Bar"]);
  await expect(page.getByTestId("auction-filters-count")).toHaveText("2");
  await expect(page.getByRole("button", { name: /^Remove filter:/ })).toHaveCount(2);
  await page.getByRole("button", { name: /^Remove filter: Price/ }).click();
  await expect(page).not.toHaveURL(/max=/);
  expect(await rowNames(page, 2)).toEqual(["Rare Test Item", "Gold Bar"]);
});

test("on a phone the filters open in a bottom sheet that doesn't scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await stubFilterPrices(page);
  await page.goto("/wow-forever/auction-house");
  await expect(page.getByTestId("auction-row")).toHaveCount(3);
  await expectNoSidewaysScroll(page);
  const button = page.getByTestId("auction-filters-button");
  await button.click();
  const sheet = page.getByTestId("auction-filter-sheet");
  await expect(sheet).toBeVisible();
  await expectNoSidewaysScroll(page);
  await sheet.getByTestId("auction-filter-quality").getByRole("button", { name: "Common", exact: true }).click();
  await expect(sheet.getByRole("button", { name: /^Apply · 1 item$/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(page).toHaveURL(/quality=common/);
  expect(await rowNames(page, 1)).toEqual(["Linen Cloth"]);
  await expectNoSidewaysScroll(page);
});

test("the Auction house page downloads the MGA Prices addon with every house's prices inside", async ({ page }) => {
  const asked: string[] = [];
  await stubFactionPrices(page, (faction) => BLUE_PEARL_BY_FACTION[faction] ?? [], asked);
  await page.goto("/wow-forever/auction-house");
  const card = page.getByTestId("prices-addon");
  await card.getByText("Get these prices in your game tooltips").click();
  await expect(card).toContainText(String.raw`World of Warcraft\_forever_\Interface\AddOns`);
  const [download] = await Promise.all([page.waitForEvent("download"), card.getByTestId("prices-addon-download").click()]);
  expect(download.suggestedFilename()).toBe("MGAPrices.zip");
  const files = unzipSync(readFileSync(await download.path()));
  const data = strFromU8(files["MGAPrices/Data.lua"]);
  expect(data).toContain("alliance = {");
  expect(data).toContain("[4611] = {3300, 3300, 20},");
  expect(data).toContain("[4611] = {3495, 3495, 20},");
  expect(data).toContain("[4611] = {5349, 5349, 20},");
  // Crafting demand rides along: vendor thread says so, Linen Cloth names its leveling routes.
  expect(data).toContain("[2320] = {vendor = true},");
  expect(data).toMatch(/\[2589\] = \{leveling = "[^"]*First Aid 1–\d+/);
  expect(data).toContain("crafts = {");
  expect(strFromU8(files["MGAPrices/MGAPrices.toc"])).toContain("## SavedVariables: MGAPricesSettings");
  expect(asked).toEqual(expect.arrayContaining(["pvp/alliance", "pvp/horde", "pvp/neutral"]));
  await expect(page.getByText("MGA Prices is downloading. Unzip it into your AddOns folder.").first()).toBeVisible();
});

test("priced pages never scroll sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await stubPrices(page, [...craftingRows(), ...FOOD_ROWS]);
  for (const path of [
    "/wow-forever/professions?p=tailoring&skill=150",
    "/wow-forever/professions?p=enchanting",
    "/wow-forever/food/6890",
    "/wow-forever/auction-house?prof=enchanting",
    "/wow-forever/auction-house?prof=enchanting&recipe=7421",
  ]) {
    await page.goto(path);
    await expect(page.getByTestId("price-credit").first()).toBeVisible();
    await expectNoSidewaysScroll(page);
  }
  await page.goto("/wow-forever/professions?p=enchanting");
  await page.locator("#route").getByRole("button", { name: /^Prices/ }).click();
  await expectNoSidewaysScroll(page);
});
