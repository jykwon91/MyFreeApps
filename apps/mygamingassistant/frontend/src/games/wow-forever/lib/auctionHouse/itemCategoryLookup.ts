/** Questions the Auction house filter asks of the decoded item categories. Pure. */
import { UNLISTED_ITEM_PLACE } from "@/games/wow-forever/data/auctionHouse/auctionCategories";
import type { AuctionCategory } from "@/games/wow-forever/types/auctionHouse/auctionCategory";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { ItemCategoryIndex } from "@/games/wow-forever/types/auctionHouse/itemCategoryIndex";

/** True when the item is in the filter's category (and subclass, when one is chosen); an unlisted item is Miscellaneous. */
export function inCategory(itemId: number, filters: AuctionFilters, categories: ItemCategoryIndex): boolean {
  const place = categories.placeOf.get(itemId) ?? UNLISTED_ITEM_PLACE;
  if (place.category !== filters.category) return false;
  return filters.subcategory === null || place.subclass === filters.subcategory;
}

/** The game's name for a subclass, or null when the category has no such subclass. */
export function subcategoryLabel(categories: ItemCategoryIndex, category: AuctionCategory, subclassId: number): string | null {
  return categories.subclasses.get(category)?.find((s) => s.id === subclassId)?.label ?? null;
}
