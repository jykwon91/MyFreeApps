import type { AuctionSearchResult } from "@/games/wow-forever/types/auctionSearchResult";

/** The Auction house list narrowed to one profession's materials. */
export interface ProfessionMaterialsResult extends AuctionSearchResult {
  /** Materials the search would match that have no auctions on this house right now. */
  notOnSale: number;
}
