import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";

export interface AuctionFiltersState {
  filters: AuctionFilters;
  /** Changes some filters; every change replaces the history entry, so Back never walks through each keystroke. */
  update: (patch: Partial<AuctionFilters>) => void;
  /** Switches every filter off (the search and the order stay). */
  clear: () => void;
}
