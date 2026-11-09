/** One item's price on a faction's auction houses, in copper per unit. */
export interface AuctionPrice {
  itemId: number;
  name: string;
  /**
   * What the item costs, and the price every page uses: the cheapest 10% of the
   * units on sale sit at or below it, so one odd listing can't move it. Never 0
   * for "unknown": an item without a price simply has no entry.
   */
  marketValue: number;
  /** The cheapest unit on sale right now. */
  minBuyout: number;
  /** Units on sale. */
  quantity: number;
  /** Auctions listing them. */
  listings: number;
}
