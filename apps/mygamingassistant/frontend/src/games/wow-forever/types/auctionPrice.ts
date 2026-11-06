/** One item's auction-house price in a region, in copper. */
export interface AuctionPrice {
  itemId: number;
  name: string;
  /** What the item is worth, and the price every page uses. Never 0 for "unknown": an item without a price simply has no entry. */
  marketValue: number;
  /** Null = the source saw no sales. */
  avgSalePrice: number | null;
  soldPerDay: number | null;
}
