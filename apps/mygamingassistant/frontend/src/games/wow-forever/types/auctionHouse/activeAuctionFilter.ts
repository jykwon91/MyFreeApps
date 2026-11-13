import type { AuctionFilterGroup } from "@/games/wow-forever/types/auctionHouse/auctionFilterGroup";

/** A filter that is on, as the chip under the search names it. */
export interface ActiveAuctionFilter {
  group: AuctionFilterGroup;
  label: string;
}
