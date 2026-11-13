import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import type { AuctionQualityFilter } from "@/games/wow-forever/types/auctionHouse/auctionQualityFilter";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";

/** Everything the Auction house page searches, filters and sorts by. Lives in the URL. */
export interface AuctionFilters {
  /** `?q=` — a name fragment or an exact item id. */
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
  /** Gear filters: these need the game's item list. */
  slot: ItemSlot | null;
  itemType: string | null;
  minLevel: number | null;
  maxLevel: number | null;
  /** Only gear the player's class can equip. */
  usable: boolean;
}
