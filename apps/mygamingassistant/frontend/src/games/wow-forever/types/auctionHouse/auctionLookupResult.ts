import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";

/** The items to list (filtered and sorted, not paged), plus the profession materials with no auctions. */
export interface AuctionLookupResult {
  items: AuctionPrice[];
  /** Materials the search would match that have no auctions on this house right now. */
  notOnSale: number;
}
