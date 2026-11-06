import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";

/** The items to show for a search, plus how many matched before the cap. */
export interface AuctionSearchResult {
  items: AuctionPrice[];
  /** Every match, before the cap. */
  total: number;
  /** True when `total` is more than `items` shows. */
  capped: boolean;
}
