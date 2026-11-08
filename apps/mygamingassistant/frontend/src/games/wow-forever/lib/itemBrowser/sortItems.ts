import type { ItemIndexEntry } from "@/games/wow-forever/types/itemBrowser/itemIndexEntry";
import { SORT_DIRECTION, type SortDirection } from "@/games/wow-forever/types/itemBrowser/itemSortDirection";
import { ITEM_SORT, type ItemSortKey } from "@/games/wow-forever/types/itemBrowser/itemSortKey";

// One collator for the whole sort: much faster than localeCompare on ~9,500 names.
const byName = new Intl.Collator("en").compare;

function primary(a: ItemIndexEntry, b: ItemIndexEntry, sort: ItemSortKey): number {
  switch (sort) {
    case ITEM_SORT.itemLevel:
      return a.itemLevel - b.itemLevel;
    case ITEM_SORT.requiredLevel:
      return a.requiredLevel - b.requiredLevel;
    case ITEM_SORT.name:
      return byName(a.name, b.name);
  }
}

/** A sorted copy. The direction flips only the chosen key; ties always go A–Z by name, then by id. */
export function sortItems(items: readonly ItemIndexEntry[], sort: ItemSortKey, direction: SortDirection): ItemIndexEntry[] {
  const sign = direction === SORT_DIRECTION.asc ? 1 : -1;
  return [...items].sort((a, b) => sign * primary(a, b, sort) || byName(a.name, b.name) || a.id - b.id);
}
