import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";

/** Identifies what the list is showing; the paging starts over when it changes, not when prices merely refetch. Pure. */
export function auctionResultsKey(house: string, professionLabel: string | null, filters: AuctionFilters): string {
  return JSON.stringify([house, professionLabel, filters]);
}
