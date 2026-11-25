import type { SaleGap } from "@/games/wow-forever/types/auctionHouse/saleGap";

/** What one craft's products sell for at one house. */
export interface RecipeSale {
  /** Copper one craft brings in after the house's cut; 0 when `gap` is set. */
  sells: number;
  gap: SaleGap | null;
  /** Units of the product on sale now (0 when it has no price). */
  onSale: number;
}
