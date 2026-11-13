import type { ActiveAuctionFilter } from "@/games/wow-forever/types/auctionHouse/activeAuctionFilter";

/** What the empty Auction house list needs to say why it is empty. */
export interface AuctionEmptyMessageInput {
  query: string;
  active: readonly ActiveAuctionFilter[];
  /** Set when the list is one profession's materials. */
  professionLabel: string | null;
}
