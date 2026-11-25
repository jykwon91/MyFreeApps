import type { SaleGap } from "@/games/wow-forever/types/auctionHouse/saleGap";

/** A route row's materials and what its products sell for, in copper over all the row's crafts (the row's cost is materials less sells). */
export interface RowSale {
  materials: number;
  sells: number;
  gap: SaleGap | null;
  /** Units of the product on sale now. */
  onSale: number;
}
