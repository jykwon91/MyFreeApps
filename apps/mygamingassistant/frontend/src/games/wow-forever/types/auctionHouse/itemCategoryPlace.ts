import type { AuctionCategory } from "@/games/wow-forever/types/auctionHouse/auctionCategory";

/** Where one item is filed: its category and, except for gear, the game's subclass id. */
export interface ItemCategoryPlace {
  category: AuctionCategory;
  subclass: number | null;
}
