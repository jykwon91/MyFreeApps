/** Questions the Auction house filter asks of the decoded item categories. Pure. */
import { UNLISTED_ITEM_PLACE } from "@/games/wow-forever/data/auctionHouse/auctionCategories";
import type { AuctionCategory } from "@/games/wow-forever/types/auctionHouse/auctionCategory";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { ItemCategoryIndex } from "@/games/wow-forever/types/auctionHouse/itemCategoryIndex";

/** True when the item is in the filter's category (and subclass, when a known one is chosen); an unlisted item is Miscellaneous. */
export function inCategory(itemId: number, filters: AuctionFilters, categories: ItemCategoryIndex): boolean {
  const place = categories.placeOf.get(itemId) ?? UNLISTED_ITEM_PLACE;
  if (filters.category === null || place.category !== filters.category) return false;
  const subclass = knownSubcategory(categories, filters.category, filters.subcategory);
  return subclass === null || place.subclass === subclass;
}

/** The chosen subclass when the category has it; a subclass it lacks (an old or edited link) means all of the category. */
export function knownSubcategory(categories: ItemCategoryIndex, category: AuctionCategory, subclassId: number | null): number | null {
  if (subclassId === null) return null;
  return subcategoryLabel(categories, category, subclassId) === null ? null : subclassId;
}

/** The game's name for a subclass, or null when the category has no such subclass. */
export function subcategoryLabel(categories: ItemCategoryIndex, category: AuctionCategory, subclassId: number): string | null {
  return categories.subclasses.get(category)?.find((s) => s.id === subclassId)?.label ?? null;
}
