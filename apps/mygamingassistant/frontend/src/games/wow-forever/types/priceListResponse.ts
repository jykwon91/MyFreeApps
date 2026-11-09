import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";
import type { PriceServer } from "@/games/wow-forever/types/priceServer";

/**
 * `GET /api/wow/prices?server=&faction=` (US only): one auction house, columnar —
 * `columns` names the cells of each `items` row. Prices are copper per unit.
 * An empty `items` list means no prices yet; it never means everything is free.
 */
export interface PriceListResponse {
  /** Always "us". */
  region: string;
  server: PriceServer;
  faction: PriceFaction;
  /** ISO time Blizzard took this house's snapshot ("updated 1 hour ago"). Null = no prices yet. */
  source_updated_at: string | null;
  fetched_at: string | null;
  columns: string[];
  items: (string | number | null)[][];
}
