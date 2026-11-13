import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { ItemQuality } from "@/games/wow-forever/data/itemSlots";
import type { BisPick } from "@/games/wow-forever/types/auctionHouse/bisPick";
import type { ItemCategoryIndex } from "@/games/wow-forever/types/auctionHouse/itemCategoryIndex";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

/** What the item filters look things up in. */
export interface AuctionFilterContext {
  /** An item's quality; null = the icon map doesn't know it. */
  qualityOf: (itemId: number) => ItemQuality | null;
  /** The game's gear list; null until it has loaded (gear filters then don't apply). */
  gear: ReadonlyMap<number, ClientItem> | null;
  /** Where each item is filed; null until it has loaded (the category filter then doesn't apply). */
  categories: ItemCategoryIndex | null;
  /** The top picks per slot (`?bis=`); null until the gear data has loaded (the filter then doesn't apply). */
  bisPicks: ReadonlyMap<number, BisPick> | null;
  /** The player's class, for "usable by my class". */
  classId: WowClassId;
}
