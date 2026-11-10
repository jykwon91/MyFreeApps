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
 *   - "Download the addon" zips MGA Prices with every house's prices in Data.lua, plus crafting demand per material
 *   - nothing scrolls sideways at 375px
 *
 * Run: npm run test:e2e -- wow-forever-auction-prices
 */
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { test, expect, type Page } from "@playwright/test";

const PRICES = "**/wow/prices**";
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
  const url = new URL(`../src/games/wow-forever/data/professions/crafting/${file}.json`, import.meta.url);
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
  expect(files["MGAPrices/MGAPrices.toc"]).toBeDefined();
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
