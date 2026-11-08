import type { PriceCredit } from "@/games/wow-forever/types/priceCredit";

/**
 * `GET /api/wow/prices` (US only), columnar: `columns` names the cells of each
 * `items` row. Prices are copper and a null cell is "no value". An empty
 * `items` list means no prices yet; it never means everything is free.
 */
export interface PriceListResponse {
  /** Always "us". */
  region: string;
  credit: PriceCredit;
  /** ISO time the source worked these prices out ("updated 3 hours ago"). Null = no prices yet. */
  source_updated_at: string | null;
  fetched_at: string | null;
  columns: string[];
  items: (string | number | null)[][];
}
