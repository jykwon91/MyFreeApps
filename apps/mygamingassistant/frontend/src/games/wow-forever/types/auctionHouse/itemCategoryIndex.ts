import type { AuctionCategory } from "@/games/wow-forever/types/auctionHouse/auctionCategory";
import type { ItemCategoryPlace } from "@/games/wow-forever/types/auctionHouse/itemCategoryPlace";
import type { ItemCategorySubclass } from "@/games/wow-forever/types/auctionHouse/itemCategorySubclass";

/** The decoded item categories: what each category holds and where each item is filed. */
export interface ItemCategoryIndex {
  /** A category's subclasses that have items, in the game's order. Gear has none. */
  subclasses: ReadonlyMap<AuctionCategory, readonly ItemCategorySubclass[]>;
  placeOf: ReadonlyMap<number, ItemCategoryPlace>;
}
