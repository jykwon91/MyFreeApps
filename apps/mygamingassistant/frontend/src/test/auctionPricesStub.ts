/**
 * Stand-ins for `useGetWowPricesQuery` in component tests, so a page renders
 * with known auction prices (or loading / failed) and without a Redux store.
 * Pair it with:
 *
 *   const usePricesQuery = vi.hoisted(() => vi.fn());
 *   vi.mock("@/games/wow-forever/api/wowPricesApi", () => ({ useGetWowPricesQuery: usePricesQuery }));
 */
import { vi } from "vitest";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";

export const PRICE_COLUMNS = ["item_id", "market_value", "avg_sale_price", "historical", "sold_per_day", "name"];
export const TSM_CREDIT = { source: "tsm", name: "TradeSkillMaster", url: "https://www.tradeskillmaster.com" };

/** [item id, market value in copper, name] per item. */
export function priceList(rows: readonly [number, number, string][], updatedAt = "2026-11-06T09:00:00Z"): PriceListResponse {
  return {
    region: "us",
    credit: TSM_CREDIT,
    source_updated_at: rows.length ? updatedAt : null,
    fetched_at: rows.length ? updatedAt : null,
    columns: PRICE_COLUMNS,
    items: rows.map(([id, value, name]) => [id, value, null, value, null, name]),
  };
}

export function pricesReady(data: PriceListResponse) {
  return { data, isError: false, isFetching: false, refetch: vi.fn() };
}

export function pricesLoading() {
  return { data: undefined, isError: false, isFetching: true, refetch: vi.fn() };
}

export function pricesFailed() {
  return { data: undefined, isError: true, isFetching: false, refetch: vi.fn() };
}
