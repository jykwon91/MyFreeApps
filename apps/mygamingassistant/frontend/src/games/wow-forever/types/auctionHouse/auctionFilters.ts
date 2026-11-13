import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import type { AuctionCategory } from "@/games/wow-forever/types/auctionHouse/auctionCategory";
import type { BisChoice } from "@/games/wow-forever/types/auctionHouse/bisChoice";
import type { AuctionQualityFilter } from "@/games/wow-forever/types/auctionHouse/auctionQualityFilter";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";

/** Everything the Auction house page searches, filters and sorts by. Lives in the URL. */
export interface AuctionFilters {
  /** `?q=` â€” a name fragment or an exact item id. */
  query: string;
  sort: AuctionSort;
  /** Empty = any quality. */
  qualities: readonly AuctionQualityFilter[];
  /** Market value range, in gold. */
  minGold: number | null;
  maxGold: number | null;
  /** At least this many units on sale. */
  minQuantity: number | null;
  /** At least this many auctions. */
  minListings: number | null;
  /** `?cat=` â€” one item category; this needs the item categories file. */
  category: AuctionCategory | null;
  /** `?sub=` â€” the game's subclass id within `category`; only meaningful with a category. */
  subcategory: number | null;
  /** Gear filters: these need the game's item list. */
  slot: ItemSlot | null;
  itemType: string | null;
  minLevel: number | null;
  maxLevel: number | null;
  /** Only gear the player's class can equip. */
  usable: boolean;
  /** `?bis=` — only the top picks for the player's class at their level; needs the gear data. */
  bis: BisChoice | null;
  /** `?bisLvl=` — the level to pick for, instead of the player's own; only meaningful with `bis`. */
  bisLevel: number | null;
}
