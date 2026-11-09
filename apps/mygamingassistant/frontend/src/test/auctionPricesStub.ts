/**
 * Stand-ins for `useGetWowPricesQuery` in component tests, so a page renders
 * with known auction prices (or loading / failed) and without a Redux store.
 * Pair it with:
 *
 *   const usePricesQuery = vi.hoisted(() => vi.fn());
 *   vi.mock("@/games/wow-forever/api/wowPricesApi", () => ({ useGetWowPricesQuery: usePricesQuery }));
 */
import { vi } from "vitest";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";

export const PRICE_COLUMNS = ["item_id", "market_value", "min_buyout", "quantity", "listings", "name"];

/** Units on sale every stubbed item has, and the auctions listing them. */
export const STUB_QUANTITY = 40;
export const STUB_LISTINGS = 5;

/** [item id, market value in copper, name] per item; the cheapest listing is the market value. */
export function priceList(
  rows: readonly [number, number, string][],
  updatedAt = "2026-11-06T09:00:00Z",
  faction: PriceFaction = "alliance",
): PriceListResponse {
  return {
    region: "us",
    server: "pvp",
    faction,
    source_updated_at: rows.length ? updatedAt : null,
    fetched_at: rows.length ? updatedAt : null,
    columns: PRICE_COLUMNS,
    items: rows.map(([id, value, name]) => [id, value, value, STUB_QUANTITY, STUB_LISTINGS, name]),
  };
}

export function pricesReady(data: PriceListResponse) {
  return { data, currentData: data, isError: false, isFetching: false, refetch: vi.fn() };
}

export function pricesLoading() {
  return { data: undefined, currentData: undefined, isError: false, isFetching: true, refetch: vi.fn() };
}

export function pricesFailed() {
  return { data: undefined, currentData: undefined, isError: true, isFetching: false, refetch: vi.fn() };
}
