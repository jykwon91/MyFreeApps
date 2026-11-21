/**
 * WoW Forever Waylaid crates page — E2E, network-stubbed.
 *
 *   - rows are ordered by cost per reward (crate + its cheapest bundle - the tier's hand-in refund, over the rewards the crate pays), cheapest first, crates with no total last
 *   - the cheapest bundle and what it costs show in the row; a crate whose materials have no price says so
 *   - "All N bundles" folds out every bundle with its prices and a Cheapest mark
 *   - the tier filter lives in the link and narrows the grid ("Showing N of M"), with Clear filters
 *   - sorting by a column header (Per reward, Total, Rewards) flips its direction and keeps unknown totals last
 *   - switching the auction house re-prices the rows
 *   - prices that fail to load leave the rows, with a retry
 *   - the search box matches the crate or any bundle's material, lives in `?q=`, restores on reload, and clears
 *   - a phone gets a card per crate with a sort select, and nothing scrolls sideways
 *   - while prices load the rows are already there, with skeletons where the prices go
 *
 * The crates come from the real data file (any row count): the spec picks crates by tier and prices only those.
 *
 * Stubbed: `/wow/prices` (per house).
 *
 * Run: npx playwright test e2e/mocked/wow-forever-crates.spec.ts --config=playwright.layout.config.ts
 */
import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const PRICES = /\/wow\/prices(\?|$)/;
const COLUMNS = ["item_id", "market_value", "min_buyout", "quantity", "listings", "name"];
const UPDATED_AT = "2026-11-19T09:00:00Z";
const NOW = new Date("2026-11-19T12:00:00Z");
const PREFIX = "Waylaid Crate: ";
const CRATE_TIER_LABEL = { apprentice: "Apprentice", journeyman: "Journeyman", expert: "Expert", artisan: "Artisan" } as const;

interface Material {
  id: number;
  name: string;
}

interface Bundle {
  count: number;
  item: Material;
}

interface Crate {
  id: number;
  name: string;
  tier: "apprentice" | "journeyman" | "expert" | "artisan";
  quality: "common" | "uncommon";
  bundles: Bundle[];
}

const CRATES = (
  JSON.parse(readFileSync(new URL("../../src/games/wow-forever/data/professions/crates/crates.json", import.meta.url), "utf-8")) as {
    crates: Crate[];
  }
).crates;

const short = (crate: Crate) => crate.name.replace(PREFIX, "");
const materialIds = (crate: Crate) => crate.bundles.map((b) => b.item.id);

/** The first common crate of a tier with at least `minBundles` bundles, none of whose materials is in `avoid`. */
function pick(tier: Crate["tier"], minBundles: number, avoid: Set<number> = new Set()): Crate {
  const found = CRATES.find((c) => c.tier === tier && c.quality === "common" && c.bundles.length >= minBundles && !materialIds(c).some((id) => avoid.has(id)));
  if (!found) throw new Error(`no common ${tier} crate with ${minBundles}+ bundles`);
  return found;
}

// CHEAP: its second bundle is priced far below its first, and no other bundle is. DEAR: only its first bundle is priced.
const CHEAP = pick("apprentice", 2);
const DEAR = pick("journeyman", 2);
// UNPRICED_BUNDLES has a crate price but no priced material; NO_CRATE_PRICE has priced materials but no crate price.
const NO_CRATE_PRICE = pick("artisan", 2);
const PRICED_MATERIALS = new Set([...materialIds(CHEAP), ...materialIds(DEAR), ...materialIds(NO_CRATE_PRICE)]);
const UNPRICED_BUNDLES = pick("expert", 2, PRICED_MATERIALS);

const CHEAP_BUNDLE = CHEAP.bundles[1];
const DEAR_BUNDLE = DEAR.bundles[0];

type Row = [number, number, string];

/** Alliance: CHEAP totals 10s + a few copper (5 rewards), DEAR 40s + its bundle (10 rewards); Horde: CHEAP's crate costs 100g, so DEAR goes first. */
function rowsFor(faction: string): Row[] {
  const cheapCrate = faction === "horde" ? 1_000_000 : 1_000;
  return [
    [CHEAP.id, cheapCrate, CHEAP.name],
    [CHEAP_BUNDLE.item.id, 1, CHEAP_BUNDLE.item.name],
    [CHEAP.bundles[0].item.id, 100_000, CHEAP.bundles[0].item.name],
    [DEAR.id, 4_000, DEAR.name],
    [DEAR_BUNDLE.item.id, 50, DEAR_BUNDLE.item.name],
    [UNPRICED_BUNDLES.id, 99, UNPRICED_BUNDLES.name],
    [NO_CRATE_PRICE.bundles[0].item.id, 7, NO_CRATE_PRICE.bundles[0].item.name],
  ];
}

function body(rows: Row[], faction: string) {
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

async function stubPrices(page: Page) {
  await page.route(PRICES, (route) => {
    const faction = new URL(route.request().url()).searchParams.get("faction") ?? "alliance";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body(rowsFor(faction), faction)) });
  });
}

function rowOf(page: Page, crate: Crate): Locator {
  return page.getByTestId("crate-row").filter({ has: page.getByRole("link", { name: short(crate), exact: true }) });
}

async function firstRowNames(page: Page, count: number): Promise<string[]> {
  const names: string[] = [];
  for (let i = 0; i < count; i += 1) {
    names.push((await page.getByTestId("crate-row").nth(i).getByRole("link").first().innerText()).trim());
  }
  return names;
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
  await page.clock.setFixedTime(NOW);
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("orders by cost per reward, cheapest first, with unknown totals last", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/crates");
    await expect(page).toHaveTitle(/Waylaid crates/);
    await expect(page.getByRole("heading", { name: "Waylaid crates" })).toBeVisible();
    await expect(page.getByTestId("crate-row")).toHaveCount(CRATES.length);
    await expect(page.getByTestId("price-credit")).toBeVisible();
    await expect(rowOf(page, CHEAP).getByTestId("crate-total")).toBeVisible();
    expect(await firstRowNames(page, 2)).toEqual([short(CHEAP), short(DEAR)]);
    await expect(page).not.toHaveURL(/sort=/);
    await expect(page.getByRole("columnheader", { name: "Per reward" })).toHaveAttribute("aria-sort", "ascending");
    // Common crates pay 5 (Apprentice) and 10 (Journeyman) rewards; the price of one reward shows with the "~" of every price.
    await expect(rowOf(page, CHEAP).getByTestId("crate-reward")).toHaveText("5");
    await expect(rowOf(page, DEAR).getByTestId("crate-reward")).toHaveText("10");
    await expect(rowOf(page, CHEAP).getByTestId("crate-per-reward")).toContainText("~");
    // A crate with a price but no priced bundle, and one with priced bundles but no crate price, have no total.
    for (const crate of [UNPRICED_BUNDLES, NO_CRATE_PRICE]) {
      const row = rowOf(page, crate);
      await expect(row.getByText("No total")).toBeVisible();
      await expect(row.getByTestId("crate-total")).toHaveCount(0);
      await expect(row.getByTestId("crate-per-reward")).toHaveCount(0);
      await expect(row.getByText("No per-reward price")).toBeVisible();
    }
    await expect(page.getByTestId("crate-row").last().getByText("No total")).toBeVisible();
  });

  test("shows the crate's name without its prefix, in full for screen readers, and every crate once with its tier", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/crates");
    const row = rowOf(page, CHEAP);
    await expect(row.getByRole("link", { name: short(CHEAP), exact: true })).toBeVisible();
    await expect(row).toContainText(PREFIX.trim());
    await expect(row.getByTestId("crate-tier").last()).toHaveText(CRATE_TIER_LABEL[CHEAP.tier]);
    await expect(row).toHaveAttribute("data-tier", CHEAP.tier);
    await expect(page.getByRole("columnheader")).toHaveText(["Crate", "Tier", "Crate price", "Cheapest bundle", "Bundle cost", "Total", "Rewards", "Per reward"]);
  });

  test("shows the cheapest bundle and what it costs, and says so when no bundle has a price", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/crates");
    const cheap = rowOf(page, CHEAP);
    const cheapest = cheap.getByTestId("crate-cheapest");
    await expect(cheapest).toContainText(`${CHEAP_BUNDLE.count} ×`);
    await expect(cheapest.getByRole("link", { name: CHEAP_BUNDLE.item.name, exact: true })).toBeVisible();
    await expect(cheapest).not.toContainText(CHEAP.bundles[0].item.name);
    await expect(cheap.getByTestId("crate-bundle-cost")).toContainText("~");
    await expect(cheap.getByTestId("crate-total")).toContainText("~");
    // The total is after the crate's hand-in refund: 5s for an Apprentice crate, 10s for a Journeyman one.
    await expect(cheap.getByTestId("crate-refund")).toHaveText("after 5s refund");
    await expect(rowOf(page, DEAR).getByTestId("crate-refund")).toHaveText("after 10s refund");

    const unpriced = rowOf(page, UNPRICED_BUNDLES);
    await expect(unpriced.getByTestId("crate-cheapest")).toContainText("no auction price");
    await expect(unpriced.getByTestId("crate-bundle-cost")).toContainText("no auction price");
  });

  test("All N bundles folds out every bundle with a Cheapest mark, and folds back", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/crates");
    const row = rowOf(page, CHEAP);
    await expect(row.getByTestId("crate-bundles")).toHaveCount(0);
    const toggle = row.getByRole("button", { name: `All ${CHEAP.bundles.length} bundles` });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const box = await toggle.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await toggle.click();
    await expect(row.getByRole("button", { name: "Hide bundles" })).toHaveAttribute("aria-expanded", "true");
    const items = row.getByTestId("crate-bundle");
    await expect(items).toHaveCount(CHEAP.bundles.length);
    await expect(row.getByTestId("crate-bundle-cheapest")).toHaveCount(1);
    const marked = row.locator("[data-testid='crate-bundle'][data-cheapest='true']");
    await expect(marked).toHaveCount(1);
    await expect(marked).toContainText(CHEAP_BUNDLE.item.name);
    await expect(marked).toContainText("Cheapest");
    await expect(items.filter({ hasText: CHEAP.bundles[0].item.name })).toContainText("each");
    // A material with no price is shown, not hidden.
    if (CHEAP.bundles.length > 2) await expect(items.filter({ hasText: CHEAP.bundles[2].item.name })).toContainText("no auction price");

    await row.getByRole("button", { name: "Hide bundles" }).click();
    await expect(row.getByTestId("crate-bundles")).toHaveCount(0);
  });

  test("the tier filter narrows the grid, keeps its place in the link and clears", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/crates?tier=artisan");
    const artisans = CRATES.filter((c) => c.tier === "artisan").length;
    await expect(page.getByTestId("crate-row")).toHaveCount(artisans);
    await expect(page.getByTestId("crates-count")).toHaveText(`Showing ${artisans} of ${CRATES.length}`);
    await expect(page.getByRole("radio", { name: /^Artisan/ })).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/tier=/);
    await expect(page.getByTestId("crate-row")).toHaveCount(CRATES.length);
    await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);

    for (const tier of ["Apprentice", "Journeyman", "Expert", "Artisan"]) {
      const count = CRATES.filter((c) => c.tier === tier.toLowerCase()).length;
      await expect(page.getByRole("radio", { name: `${tier} (${count})` })).toBeVisible();
    }
    await page.getByRole("radio", { name: /^Journeyman/ }).click();
    await expect(page).toHaveURL(/tier=journeyman/);
    await expect(page.getByTestId("crate-row")).toHaveCount(CRATES.filter((c) => c.tier === "journeyman").length);
    await expect(rowOf(page, DEAR)).toBeVisible();
    await expect(page.getByTestId("crate-row").first()).toHaveAttribute("data-tier", "journeyman");
  });

  test("a column header sorts, flips on a second click, and keeps unknown totals last", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/crates");
    const perReward = page.getByRole("columnheader", { name: "Per reward" });
    await expect(perReward).toHaveAttribute("aria-sort", "ascending");
    await perReward.getByRole("button").click();
    await expect(perReward).toHaveAttribute("aria-sort", "descending");
    await expect(page).toHaveURL(/dir=desc/);
    expect(await firstRowNames(page, 2)).toEqual([short(DEAR), short(CHEAP)]);
    await expect(page.getByTestId("crate-row").last().getByText("No total")).toBeVisible();

    const total = page.getByRole("columnheader", { name: "Total" });
    await total.getByRole("button").click();
    await expect(total).toHaveAttribute("aria-sort", "ascending");
    await expect(perReward).toHaveAttribute("aria-sort", "none");
    await expect(page).toHaveURL(/sort=total/);
    expect(await firstRowNames(page, 2)).toEqual([short(CHEAP), short(DEAR)]);
    await total.getByRole("button").click();
    await expect(total).toHaveAttribute("aria-sort", "descending");
    expect(await firstRowNames(page, 2)).toEqual([short(DEAR), short(CHEAP)]);
    await expect(page.getByTestId("crate-row").last().getByText("No total")).toBeVisible();

    const rewards = page.getByRole("columnheader", { name: "Rewards" });
    await rewards.getByRole("button").click();
    await expect(rewards).toHaveAttribute("aria-sort", "ascending");
    await expect(page).toHaveURL(/sort=reward/);
    await expect(page.getByTestId("crate-row").first().getByTestId("crate-reward")).toHaveText("5");
    await rewards.getByRole("button").click();
    await expect(rewards).toHaveAttribute("aria-sort", "descending");
    await expect(page.getByTestId("crate-row").first().getByTestId("crate-reward")).toHaveText("40");

    const tier = page.getByRole("columnheader", { name: "Tier" });
    await tier.getByRole("button").click();
    await expect(tier).toHaveAttribute("aria-sort", "ascending");
    await expect(page).toHaveURL(/sort=tier/);
    await expect(page.getByTestId("crate-row").first()).toHaveAttribute("data-tier", "apprentice");
    await expect(page.getByTestId("crate-row").last()).toHaveAttribute("data-tier", "artisan");
    await tier.getByRole("button").click();
    await expect(tier).toHaveAttribute("aria-sort", "descending");
    await expect(page.getByTestId("crate-row").first()).toHaveAttribute("data-tier", "artisan");
  });

  test("search matches the crate or any bundle's material, keeps its place in the link and clears", async ({ page }) => {
    await stubPrices(page);
    const material = CHEAP.bundles[1].item.name;
    const withMaterial = CRATES.filter((c) => c.bundles.some((b) => b.item.name.toLowerCase().includes(material.toLowerCase())));
    await page.goto("/wow-forever/crates");
    const box = page.getByRole("searchbox", { name: "Search crates" });
    await expect(box).toBeVisible();
    await expect(box).toHaveAttribute("placeholder", "Crate or material name");

    await box.fill(`  ${material.toUpperCase()} `);
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByTestId("crate-row")).toHaveCount(withMaterial.length);
    await expect(rowOf(page, CHEAP)).toBeVisible();
    await expect(page.getByTestId("crates-count")).toHaveText(`Showing ${withMaterial.length} of ${CRATES.length}`);
    // Nothing else changes in the row: the bundles stay folded.
    await expect(rowOf(page, CHEAP).getByTestId("crate-bundle")).toHaveCount(0);

    // A crate name finds the crate.
    await box.fill(short(DEAR));
    await expect(rowOf(page, DEAR)).toBeVisible();

    // Reload restores the box and the rows.
    await page.reload();
    await expect(page.getByRole("searchbox", { name: "Search crates" })).toHaveValue(short(DEAR));
    await expect(rowOf(page, DEAR)).toBeVisible();

    // Search + tier filter.
    await box.fill(material);
    await page.getByRole("radio", { name: new RegExp(`^${CRATE_TIER_LABEL[CHEAP.tier]}`) }).click();
    await expect(page).toHaveURL(/q=/);
    await expect(page).toHaveURL(new RegExp(`tier=${CHEAP.tier}`));
    await expect(page.getByTestId("crates-count")).toHaveText(
      `Showing ${withMaterial.filter((c) => c.tier === CHEAP.tier).length} of ${CRATES.length}`,
    );

    // Clear filters clears the search too.
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/q=|tier=/);
    await expect(box).toHaveValue("");
    await expect(page.getByTestId("crate-row")).toHaveCount(CRATES.length);

    // The x button and Escape empty the box; the empty state names the query.
    await box.fill("zzzz");
    await expect(page.getByText("No crates match \u201Czzzz\u201D.")).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(box).toHaveValue("");
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.getByTestId("crate-row")).toHaveCount(CRATES.length);
    await box.fill("herbs");
    await box.press("Escape");
    await expect(box).toHaveValue("");
    await expect(page).not.toHaveURL(/q=/);

    await page.goto("/wow-forever/crates?q=zzzz");
    await page.getByTestId("crates-empty").getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByTestId("crate-row")).toHaveCount(CRATES.length);
  });

  test("Clear filters straight after typing empties the box and the search stays off", async ({ page }) => {
    await stubPrices(page);
    await page.goto(`/wow-forever/crates?tier=${CHEAP.tier}`);
    const box = page.getByRole("searchbox", { name: "Search crates" });
    // Typed text not yet in the link: Clear filters lands inside the debounce window.
    await box.fill("linen");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(box).toHaveValue("");
    await page.waitForTimeout(600);
    await expect(page).not.toHaveURL(/q=|tier=/);
    await expect(page.getByTestId("crate-row")).toHaveCount(CRATES.length);
  });

  test("switching the auction house re-prices the rows", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/crates");
    await expect(rowOf(page, CHEAP).getByTestId("crate-total")).toBeVisible();
    expect(await firstRowNames(page, 1)).toEqual([short(CHEAP)]);
    await page.getByRole("radio", { name: "Horde" }).click();
    await expect(page.getByTestId("price-credit")).toContainText("Horde");
    await expect.poll(() => firstRowNames(page, 2)).toEqual([short(DEAR), short(CHEAP)]);
  });

  test("prices that fail to load leave the crates, with a retry", async ({ page }) => {
    let fail = true;
    await stubPrices(page);
    await page.route(PRICES, (route) => (fail ? route.fulfill({ status: 503, body: "" }) : route.fallback()));
    await page.goto("/wow-forever/crates");
    await expect(page.getByText("Couldn't load prices — showing crates without prices.")).toBeVisible();
    await expect(page.getByTestId("crate-row")).toHaveCount(CRATES.length);
    await expect(rowOf(page, CHEAP).getByText("no auction price").first()).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(rowOf(page, CHEAP).getByTestId("crate-total")).toBeVisible();
    expect(await firstRowNames(page, 1)).toEqual([short(CHEAP)]);
  });

  test("while prices load the rows are there with skeletons, and the loaded rows keep the same shape", async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await stubPrices(page);
    await page.route(PRICES, async (route) => {
      await held;
      await route.fallback();
    });
    await page.goto("/wow-forever/crates");
    const rows = page.getByTestId("crate-row");
    await expect(rows).toHaveCount(CRATES.length);
    const first = rows.first();
    await expect(first.locator(".animate-pulse")).toHaveCount(5);
    await expect(first.getByTestId("crate-total")).toHaveCount(0);
    const cellsLoading = await first.getByRole("cell").count();
    const heightLoading = (await first.boundingBox())?.height ?? 0;

    release();
    await expect(rowOf(page, CHEAP).getByTestId("crate-total")).toBeVisible();
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
    await expect(rows).toHaveCount(CRATES.length);
    const firstLoaded = rows.first();
    expect(await firstLoaded.getByRole("cell").count()).toBe(cellsLoading);
    const heightLoaded = (await firstLoaded.boundingBox())?.height ?? 0;
    expect(Math.abs(heightLoaded - heightLoading)).toBeLessThanOrEqual(16);
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("each crate is a card, sorted from a select, with nothing scrolling sideways", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/crates");
    const cheap = rowOf(page, CHEAP);
    await expect(cheap).toBeVisible();
    await expect(page.getByRole("columnheader").first()).toBeHidden();
    await expect(cheap).toHaveCSS("border-top-width", "1px");
    await expect(cheap.getByTestId("crate-tier").first()).toBeVisible();
    await expect(cheap.getByTestId("crate-cheapest")).toContainText("Cheapest bundle");
    await expect(cheap.getByText(/^Crate ~.* \+ Bundle ~.* − Refund 5s$/)).toBeVisible();
    await expect(cheap.getByTestId("crate-total")).toBeVisible();
    await expect(cheap.getByTestId("crate-per-reward")).toContainText("per reward");
    await expect(cheap.getByTestId("crate-per-reward")).toContainText("~");
    await expect(cheap.getByTestId("crate-reward-phone")).toHaveText("5 rewards");
    await expectNoSidewaysScroll(page);

    const search = page.getByRole("searchbox", { name: "Search crates" });
    expect((await search.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await search.fill(CHEAP.bundles[1].item.name);
    await expect(cheap).toBeVisible();
    const clear = await page.getByRole("button", { name: "Clear search" }).boundingBox();
    expect(clear?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(clear?.width ?? 0).toBeGreaterThanOrEqual(44);
    await expectNoSidewaysScroll(page);
    await search.fill("");

    await cheap.getByRole("button", { name: `All ${CHEAP.bundles.length} bundles` }).click();
    await expect(cheap.getByTestId("crate-bundle")).toHaveCount(CHEAP.bundles.length);
    await expectNoSidewaysScroll(page);

    const sort = page.getByLabel("Sort by");
    await expect(sort).toHaveValue("perReward:asc");
    await sort.selectOption("perReward:desc");
    await expect(page).toHaveURL(/dir=desc/);
    await expect(page.getByTestId("crate-row").first()).toContainText(short(DEAR));
    await sort.selectOption("total:asc");
    await expect(page).toHaveURL(/sort=total/);
    await expect(page.getByTestId("crate-row").first()).toContainText(short(CHEAP));
    await expectNoSidewaysScroll(page);

    const box = await page.getByRole("radio", { name: /^All \(/ }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
