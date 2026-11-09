import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

/**
 * `GET /api/wow/prices?faction=` (US only), columnar: `columns` names the cells
 * of each `items` row. Prices are copper per unit. An empty `items` list means
 * no prices yet; it never means everything is free.
 */
export interface PriceListResponse {
  /** Always "us". */
  region: string;
  faction: PriceFaction;
  /** ISO time Blizzard took the newest house snapshot ("updated 1 hour ago"). Null = no prices yet. */
  source_updated_at: string | null;
  fetched_at: string | null;
  columns: string[];
  items: (string | number | null)[][];
}
