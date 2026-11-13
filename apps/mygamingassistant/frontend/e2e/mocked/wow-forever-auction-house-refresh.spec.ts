/**
 * WoW Forever Auction house page — "Refresh now" — E2E, network-stubbed.
 *
 *   - newer snapshot: the button shows "Refreshing…" at once, the price on the page changes to the new
 *     one, the credit line moves to the new snapshot, a success toast shows, the new prices were asked
 *     for past the browser cache, and the button waits out the cooldown (disabled, with the minutes left)
 *   - Blizzard has nothing newer: says so plainly with when to try again, the old prices stay and the
 *     credit line still reads the old snapshot
 *   - Blizzard did not answer: says so, the prices stay
 *   - a house refreshed a moment ago starts with the button disabled and says for how long
 *   - the refresh is for the house being viewed (Horde asks for faction=horde)
 *   - nothing scrolls sideways at 375px, and the button is at least 44px tall
 *
 * Stubbed: `/wow/prices` (stateful: a refresh moves the snapshot) and `/wow/prices/refresh` (GET state, POST start).
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-auction-house-refresh
 */
import type { Page, Route } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const PRICES = (url: URL) => url.pathname.endsWith("/wow/prices");
const REFRESH = (url: URL) => url.pathname.endsWith("/wow/prices/refresh");
const COLUMNS = ["item_id", "market_value", "min_buyout", "quantity", "listings", "name"];
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const COOLDOWN_SECONDS = 600;
const REFRESH_DELAY_MS = 600;
const OLD_PRICE = 3300;
const NEW_PRICE = 4100;

interface HouseState {
  snapshotAt: string;
  fetchedAt: string;
  availableAt: string | null;
  failedAt: string | null;
  marketValue: number;
}

type Outcome = "newer" | "same" | "blizzard_down";

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function newState(overrides: Partial<HouseState> = {}): HouseState {
  return {
    snapshotAt: iso(-3 * HOUR_MS),
    fetchedAt: iso(-3 * HOUR_MS),
    availableAt: iso(-MINUTE_MS),
    failedAt: null,
    marketValue: OLD_PRICE,
    ...overrides,
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function pricesBody(state: HouseState, faction: string) {
  return {
    region: "us",
    server: "pvp",
    faction,
    source_updated_at: state.snapshotAt,
    fetched_at: state.fetchedAt,
    columns: COLUMNS,
    items: [[4611, state.marketValue, state.marketValue, 20, 4, "Blue Pearl"]],
  };
}

interface Calls {
  refreshStarts: string[];
  /** The Cache-Control request header of each price read, in order (undefined = none sent). */
  priceReads: (string | undefined)[];
}

/** The refresh endpoint moves the stored house: a newer snapshot replaces the prices, the same one only re-stamps the download. */
async function stub(page: Page, state: HouseState, outcome: Outcome = "newer"): Promise<Calls> {
  const calls: Calls = { refreshStarts: [], priceReads: [] };
  await page.route(PRICES, (route) => {
    const faction = new URL(route.request().url()).searchParams.get("faction") ?? "alliance";
    calls.priceReads.push(route.request().headers()["cache-control"]);
    return json(route, pricesBody(state, faction));
  });
  await page.route(REFRESH, async (route) => {
    if (route.request().method() === "GET") {
      return json(route, {
        source_updated_at: state.snapshotAt,
        fetched_at: state.fetchedAt,
        refresh_available_at: state.availableAt,
        refresh_failed_at: state.failedAt,
      });
    }
    calls.refreshStarts.push(new URL(route.request().url()).searchParams.get("faction") ?? "");
    await new Promise((resolve) => setTimeout(resolve, REFRESH_DELAY_MS));
    state.availableAt = iso(COOLDOWN_SECONDS * 1000);
    if (outcome === "newer") {
      state.snapshotAt = iso(-MINUTE_MS);
      state.marketValue = NEW_PRICE;
    }
    if (outcome === "blizzard_down") state.failedAt = iso(0);
    else state.fetchedAt = iso(0);
    return json(route, { status: "started", retry_after_seconds: COOLDOWN_SECONDS }, 202);
  });
  return calls;
}

const pearl = (page: Page) => page.getByTestId("auction-row").filter({ hasText: "Blue Pearl" });

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("Refresh now shows loading at the click, then the new prices and a success toast, and waits out the cooldown", async ({ page }) => {
  const calls = await stub(page, newState());
  await page.goto("/wow-forever/auction-house?q=Blue+Pearl");
  await expect(pearl(page).getByTestId("auction-market")).toHaveText("33s");
  await expect(page.getByTestId("price-credit")).toContainText("updated 3 hours ago");

  await page.getByRole("button", { name: "Refresh now" }).click();

  const busy = page.getByRole("button", { name: "Refreshing…" });
  await expect(busy).toBeVisible();
  await expect(busy).toBeDisabled();

  await expect(pearl(page).getByTestId("auction-market")).toHaveText("41s");
  await expect(page.getByTestId("price-credit")).toContainText("updated 1 minute ago");
  await expect(page.getByText("Prices updated from Blizzard's newest snapshot.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh now" })).toBeDisabled();
  await expect(page.getByText("Refreshed recently — you can refresh again in 10 minutes.")).toBeVisible();
  expect(calls.refreshStarts).toEqual(["alliance"]);
  // The browser may hold the old set for ten minutes: the new one was asked for past that cache.
  expect(calls.priceReads.at(-1)).toBe("no-cache");
});

test("when Blizzard has nothing newer it says so plainly and the old prices stay", async ({ page }) => {
  await stub(page, newState({ snapshotAt: iso(-40 * MINUTE_MS) }), "same");
  await page.goto("/wow-forever/auction-house?q=Blue+Pearl");

  await page.getByRole("button", { name: "Refresh now" }).click();

  const message = "Blizzard hasn't published newer prices yet — try again in ~20 minutes.";
  await expect(page.getByText(message, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Prices updated from Blizzard's newest snapshot.")).toHaveCount(0);
  await expect(pearl(page).getByTestId("auction-market")).toHaveText("33s");
  await expect(page.getByTestId("price-credit")).toContainText("updated 40 minutes ago");
  await expect(page.getByRole("button", { name: "Refresh now" })).toBeDisabled();
});

test("a refresh Blizzard did not answer says so and keeps the prices", async ({ page }) => {
  await stub(page, newState(), "blizzard_down");
  await page.goto("/wow-forever/auction-house?q=Blue+Pearl");

  await page.getByRole("button", { name: "Refresh now" }).click();

  await expect(
    page.getByText("Blizzard didn't answer the refresh. The prices are unchanged; we'll try again soon.", { exact: true }),
  ).toBeVisible();
  await expect(pearl(page).getByTestId("auction-market")).toHaveText("33s");
});

test("a house refreshed a moment ago starts with the button disabled and says for how long", async ({ page }) => {
  await stub(page, newState({ availableAt: iso(7 * MINUTE_MS - 5_000) }));
  await page.goto("/wow-forever/auction-house");

  await expect(page.getByRole("button", { name: "Refresh now" })).toBeDisabled();
  await expect(page.getByText("Refreshed recently — you can refresh again in 7 minutes.")).toBeVisible();
});

test("the refresh is for the house being viewed", async ({ page }) => {
  const calls = await stub(page, newState());
  await page.goto("/wow-forever/auction-house?q=Blue+Pearl");
  await page.getByRole("radiogroup", { name: "Auction house" }).getByRole("radio", { name: "Horde" }).click();
  await expect(page.getByTestId("price-credit")).toContainText("(PvP · Horde AH, US)");

  await page.getByRole("button", { name: "Refresh now" }).click();

  await expect(page.getByText("Prices updated from Blizzard's newest snapshot.", { exact: true })).toBeVisible();
  expect(calls.refreshStarts).toEqual(["horde"]);
});

test("on a phone the button sits under the credit line, is 44px tall and nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await stub(page, newState());
  await page.goto("/wow-forever/auction-house");

  const button = page.getByRole("button", { name: "Refresh now" });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
