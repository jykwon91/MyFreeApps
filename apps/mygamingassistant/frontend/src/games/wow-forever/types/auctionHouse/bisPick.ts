import type { BisRank } from "@/games/wow-forever/types/auctionHouse/bisRank";

/** An item that is one of the top three for its slot, for one class at one level. */
export interface BisPick {
  rank: BisRank;
  /** The slot's name as the Best gear page shows it, e.g. "Head" or "Rings". */
  slot: string;
}
