import { BIS_LEVEL } from "@/games/wow-forever/data/auctionHouse/auctionBisOptions";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";

/** The level the top picks are for: the one in the link, else the player's own, else the top level. Pure. */
export function bisLevelFor(filters: Pick<AuctionFilters, "bisLevel">, playerLevel: number | null): number {
  return filters.bisLevel ?? playerLevel ?? BIS_LEVEL;
}
