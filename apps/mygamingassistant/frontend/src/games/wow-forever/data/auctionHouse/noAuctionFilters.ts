import { DEFAULT_AUCTION_SORT } from "@/games/wow-forever/data/auctionSortOptions";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";

/** Nothing filtered, nothing typed, the default order. */
export const NO_AUCTION_FILTERS: AuctionFilters = {
  query: "",
  sort: DEFAULT_AUCTION_SORT,
  qualities: [],
  minGold: null,
  maxGold: null,
  minQuantity: null,
  minListings: null,
  slot: null,
  itemType: null,
  minLevel: null,
  maxLevel: null,
  usable: false,
};
