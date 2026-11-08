import type { ItemFacetCounts } from "@/games/wow-forever/types/itemBrowser/itemFacetCounts";
import type { ItemIndexEntry } from "@/games/wow-forever/types/itemBrowser/itemIndexEntry";

/** What `filterItems` returns: the kept items (index order) and the chip counts. */
export interface ItemFilterResult {
  items: ItemIndexEntry[];
  /** True when nothing matched the name exactly and one-letter-off matches are shown instead. */
  fuzzy: boolean;
  counts: ItemFacetCounts;
}
