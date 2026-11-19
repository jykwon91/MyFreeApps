/**
 * WoW Forever Crafting writs page — E2E, network-stubbed.
 *
 *   - rows are ordered by total, cheapest first, with writs that have no total last
 *   - a writ whose writ + item cost less than its tier's threshold is a deal (pill + marker); a partial price is no total
 *   - the tier filter and "Only deals" live in the link and narrow the grid ("Showing N of M")
 *   - the turn-in location filter offers "Not known yet" (no turn-ins are recorded yet)
 *   - sorting by a column header flips its direction and keeps unknown totals last
 *   - switching the auction house re-prices the rows
 *   - prices that fail to load leave the rows, with a retry
 *   - a phone gets a card per writ with a sort select, and nothing scrolls sideways
 *
 * The writs come from the real data file (any row count): the spec picks rows by tier and prices only those.
 *
 * Stubbed: `/wow/prices` (per house).
 *
 * Run: npx playwright test e2e/mocked/wow-forever-writs.spec.ts --config=playwright.layout.config.ts
 */
import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const PRICES = /\/wow\/prices(\?|$)/;
const COLUMNS = ["item_id", "market_value", "min_buyout", "quantity", "listings", "name"];
const UPDATED_AT = "2026-11-19T09:00:00Z";
const NOW = new Date("2026-11-19T12:00:00Z");

interface Writ {
  id: number;
  name: string;
  tier: "journeyman" | "expert" | "artisan";
  product: { id: number; name: string } | null;
}

const WRITS = (
  JSON.parse(readFileSync(new URL("../../src/games/wow-forever/data/professions/writs/writs.json", import.meta.url), "utf-8")) as {
    writs: Writ[];
  }
).writs;

interface Priced extends Writ {
  product: { id: number; name: string };
}

/** The first `count` writs of a tier whose item is matched and not shared with a writ already taken. */
function pick(tier: Writ["tier"], count: number, taken: Writ[] = []): Priced[] {
  const used = new Set(taken.flatMap((w) => [w.id, w.product?.id]));
  const found: Priced[] = [];
  for (const writ of WRITS) {
    if (writ.tier !== tier || !writ.product || used.has(writ.id) || used.has(writ.product.id)) continue;
    used.add(writ.id);
    used.add(writ.product.id);
    found.push(writ as Priced);
    if (found.length === count) break;
  }
  return found;
}

const [CHEAP, EXPENSIVE, PARTIAL] = pick("journeyman", 3);
const [ARTISAN_DEAL] = pick("artisan", 1, [CHEAP, EXPENSIVE, PARTIAL]);

type Row = [number, number, string];

/** Alliance: CHEAP 20s total (deal), ARTISAN_DEAL 1g total (deal), EXPENSIVE 6g total, PARTIAL has only its writ priced. Horde: CHEAP costs 8g. */
function rowsFor(faction: string): Row[] {
  const cheap = faction === "horde" ? 40_000 : 1_000;
  return [
    [CHEAP.id, cheap, CHEAP.name],
    [CHEAP.product.id, cheap, CHEAP.product.name],
    [ARTISAN_DEAL.id, 5_000, ARTISAN_DEAL.name],
    [ARTISAN_DEAL.product.id, 5_000, ARTISAN_DEAL.product.name],
    [EXPENSIVE.id, 30_000, EXPENSIVE.name],
    [EXPENSIVE.product.id, 30_000, EXPENSIVE.product.name],
    [PARTIAL.id, 100, PARTIAL.name],
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

function rowOf(page: Page, writ: Writ): Locator {
  return page.getByTestId("writ-row").filter({ has: page.getByRole("link", { name: writ.name, exact: true }) });
}

async function firstRowNames(page: Page, count: number): Promise<string[]> {
  const names: string[] = [];
  for (let i = 0; i < count; i += 1) {
    names.push((await page.getByTestId("writ-row").nth(i).getByRole("link").first().innerText()).trim());
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

  test("orders by total, cheapest first, with unknown totals last", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/writs");
    await expect(page.getByRole("heading", { name: "Crafting writs" })).toBeVisible();
    await expect(page.getByTestId("writ-row")).toHaveCount(WRITS.length);
    await expect(page.getByTestId("price-credit")).toBeVisible();
    await expect(rowOf(page, CHEAP).getByTestId("writ-total")).toBeVisible();
    expect(await firstRowNames(page, 3)).toEqual([CHEAP.name, ARTISAN_DEAL.name, EXPENSIVE.name]);
    // A writ priced without its item has no total (never a partial sum) and sits after every known total.
    const partial = rowOf(page, PARTIAL);
    await expect(partial.getByText("No total")).toBeVisible();
    await expect(partial.getByTestId("writ-total")).toHaveCount(0);
    const lastRow = page.getByTestId("writ-row").last();
    await expect(lastRow.getByText("No total")).toBeVisible();
  });

  test("a total under the tier's threshold is a deal, with a pill and a marker", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/writs");
    const cheap = rowOf(page, CHEAP);
    await expect(cheap).toHaveAttribute("data-deal", "true");
    await expect(cheap.getByTestId("writ-deal")).toContainText("Deal");
    await expect(cheap.getByTestId("writ-deal")).toContainText("under 50 silver for Journeyman writs");
    await expect(rowOf(page, ARTISAN_DEAL)).toHaveAttribute("data-deal", "true");
    const expensive = rowOf(page, EXPENSIVE);
    await expect(expensive).toHaveAttribute("data-deal", "false");
    await expect(expensive.getByTestId("writ-deal")).toHaveCount(0);
    await expect(rowOf(page, PARTIAL)).toHaveAttribute("data-deal", "false");
  });

  test("tier and Only deals filter the grid and keep their place in the link", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/writs?tier=artisan&deals=1");
    await expect(page.getByTestId("writ-row")).toHaveCount(1);
    await expect(rowOf(page, ARTISAN_DEAL)).toBeVisible();
    await expect(page.getByTestId("writs-count")).toHaveText(`Showing 1 of ${WRITS.length}`);
    await expect(page.getByRole("checkbox", { name: "Only deals" })).toBeChecked();
    await expect(page.getByRole("radio", { name: /^Artisan/ })).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/tier=|deals=/);
    await expect(page.getByTestId("writ-row")).toHaveCount(WRITS.length);

    await page.getByRole("radio", { name: /^Journeyman/ }).click();
    await expect(page).toHaveURL(/tier=journeyman/);
    await expect(page.getByTestId("writ-row")).toHaveCount(WRITS.filter((w) => w.tier === "journeyman").length);
    await page.getByRole("checkbox", { name: "Only deals" }).click();
    await expect(page).toHaveURL(/deals=1/);
    await expect(page.getByTestId("writ-row")).toHaveCount(1);
    await expect(rowOf(page, CHEAP)).toBeVisible();
  });

  test("no deals left says so and offers to clear the filters", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/writs?tier=expert&deals=1");
    await expect(page.getByText("No writs match these filters")).toBeVisible();
    await page.getByTestId("writs-empty").getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByTestId("writ-row")).toHaveCount(WRITS.length);
  });

  test("turn-in location offers Not known yet, which every writ is until one is recorded", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/writs");
    const select = page.getByLabel("Turn-in location");
    await expect(select.locator("option")).toHaveText([`All locations (${WRITS.length})`, `Not known yet (${WRITS.length})`]);
    await select.selectOption({ label: `Not known yet (${WRITS.length})` });
    await expect(page).toHaveURL(/loc=unknown/);
    await expect(page.getByTestId("writ-row")).toHaveCount(WRITS.length);
    await expect(rowOf(page, CHEAP).getByText("Not known yet")).toBeVisible();
    // A zone nobody recorded in the link reads as "not set".
    await page.goto("/wow-forever/writs?loc=Nowhere");
    await expect(page.getByLabel("Turn-in location")).toHaveValue("");
  });

  test("a column header sorts, flips on a second click, and keeps unknown totals last", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/writs");
    const total = page.getByRole("columnheader", { name: "Total" });
    await expect(total).toHaveAttribute("aria-sort", "ascending");
    await total.getByRole("button").click();
    await expect(total).toHaveAttribute("aria-sort", "descending");
    await expect(page).toHaveURL(/dir=desc/);
    expect(await firstRowNames(page, 3)).toEqual([EXPENSIVE.name, ARTISAN_DEAL.name, CHEAP.name]);
    await expect(page.getByTestId("writ-row").last().getByText("No total")).toBeVisible();

    const tier = page.getByRole("columnheader", { name: "Tier" });
    await tier.getByRole("button").click();
    await expect(tier).toHaveAttribute("aria-sort", "ascending");
    await expect(page).toHaveURL(/sort=tier/);
    await expect(page.getByTestId("writ-row").first()).toHaveAttribute("data-tier", "journeyman");
    await expect(page.getByTestId("writ-row").last()).toHaveAttribute("data-tier", "artisan");
  });

  test("switching the auction house re-prices the rows", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/writs");
    await expect(rowOf(page, CHEAP)).toHaveAttribute("data-deal", "true");
    await page.getByRole("radio", { name: "Horde" }).click();
    await expect(rowOf(page, CHEAP)).toHaveAttribute("data-deal", "false");
    await expect(page.getByTestId("price-credit")).toContainText("Horde");
    expect(await firstRowNames(page, 1)).toEqual([ARTISAN_DEAL.name]);
  });

  test("an unmatched item reads Unknown item, as plain text", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/writs");
    const unmatched = WRITS.find((w) => w.product === null);
    test.skip(!unmatched, "every writ in the data file has a matched item");
    const row = rowOf(page, unmatched as Writ);
    await expect(row.getByTestId("writ-item-unknown")).toContainText("Unknown item");
    await expect(row.getByRole("link")).toHaveCount(1);
  });

  test("prices that fail to load leave the writs, with a retry", async ({ page }) => {
    let fail = true;
    await stubPrices(page);
    await page.route(PRICES, (route) => (fail ? route.fulfill({ status: 503, body: "" }) : route.fallback()));
    await page.goto("/wow-forever/writs");
    await expect(page.getByText("Couldn't load prices — showing writs without prices.")).toBeVisible();
    await expect(page.getByTestId("writ-row")).toHaveCount(WRITS.length);
    await expect(rowOf(page, CHEAP).getByText("no auction price").first()).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(rowOf(page, CHEAP)).toHaveAttribute("data-deal", "true");
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("each writ is a card, sorted from a select, with nothing scrolling sideways", async ({ page }) => {
    await stubPrices(page);
    await page.goto("/wow-forever/writs");
    const cheap = rowOf(page, CHEAP);
    await expect(cheap).toBeVisible();
    await expect(page.getByRole("columnheader").first()).toBeHidden();
    await expect(cheap).toHaveCSS("border-top-width", "1px");
    await expect(cheap.getByTestId("writ-tier").first()).toBeVisible();
    await expect(cheap.getByText(/^Writ ~.* \+ Item ~/)).toBeVisible();
    await expect(cheap.getByTestId("writ-deal")).toBeVisible();
    await expectNoSidewaysScroll(page);

    const sort = page.getByLabel("Sort by");
    await sort.selectOption("total:desc");
    await expect(page).toHaveURL(/dir=desc/);
    await expect(page.getByTestId("writ-row").first()).toContainText(EXPENSIVE.name);
    await expectNoSidewaysScroll(page);

    const box = await page.getByRole("radio", { name: /^All \(/ }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
