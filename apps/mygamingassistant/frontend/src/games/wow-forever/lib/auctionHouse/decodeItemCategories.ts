/** `itemCategories.json` -> the lookups the Auction house filter uses. Pure. */
import {
  AUCTION_CATEGORY_BY_CLASS,
  GEAR_CATEGORY,
  SUBCLASS_KEY_PATTERN,
} from "@/games/wow-forever/data/auctionHouse/auctionCategories";
import type { AuctionCategory } from "@/games/wow-forever/types/auctionHouse/auctionCategory";
import type { ItemCategoriesFile } from "@/games/wow-forever/types/auctionHouse/itemCategoriesFile";
import type { ItemCategoryIndex } from "@/games/wow-forever/types/auctionHouse/itemCategoryIndex";
import type { ItemCategoryPlace } from "@/games/wow-forever/types/auctionHouse/itemCategoryPlace";
import type { ItemCategorySubclass } from "@/games/wow-forever/types/auctionHouse/itemCategorySubclass";

/** Where a file key files its items; null for a class the page has no category for. */
function placeForKey(key: string): ItemCategoryPlace | null {
  if (key === GEAR_CATEGORY) return { category: GEAR_CATEGORY, subclass: null };
  const match = SUBCLASS_KEY_PATTERN.exec(key);
  if (!match) return null;
  const category = AUCTION_CATEGORY_BY_CLASS[Number(match[1])];
  return category ? { category, subclass: Number(match[2]) } : null;
}

export function decodeItemCategories(file: ItemCategoriesFile): ItemCategoryIndex {
  const subclasses = new Map<AuctionCategory, ItemCategorySubclass[]>();
  const placeOf = new Map<number, ItemCategoryPlace>();
  for (const [key, ids] of Object.entries(file.items)) {
    const place = placeForKey(key);
    if (!place) continue;
    // One place object per key, shared by all its items.
    for (const id of ids) placeOf.set(id, place);
    const label = file.subclasses[key];
    if (place.subclass !== null && label) {
      subclasses.set(place.category, [...(subclasses.get(place.category) ?? []), { id: place.subclass, label }]);
    }
  }
  for (const list of subclasses.values()) list.sort((a, b) => a.id - b.id);
  return { subclasses, placeOf };
}
