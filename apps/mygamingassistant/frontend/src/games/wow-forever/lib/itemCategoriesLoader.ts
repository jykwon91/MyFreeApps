import itemCategoriesUrl from "@/games/wow-forever/data/items/itemCategories.json?url";
import { decodeItemCategories } from "@/games/wow-forever/lib/auctionHouse/decodeItemCategories";
import type { ItemCategoriesFile } from "@/games/wow-forever/types/auctionHouse/itemCategoriesFile";
import type { ItemCategoryIndex } from "@/games/wow-forever/types/auctionHouse/itemCategoryIndex";

// ~130 KB (~55 KB gzipped), served from this site as a hashed asset and
// fetched the first time the Auction house category filter is used, then
// shared. Fetched rather than imported so no JS chunk (and not the type
// checker) carries it.
let pending: Promise<ItemCategoryIndex> | null = null;

async function fetchIndex(): Promise<ItemCategoryIndex> {
  const response = await fetch(itemCategoriesUrl);
  if (!response.ok) throw new Error(`Item categories request failed: HTTP ${response.status}`);
  return decodeItemCategories((await response.json()) as ItemCategoriesFile);
}

/** The item categories, loaded once. A failed load is forgotten so the next call tries again. */
export function loadItemCategories(): Promise<ItemCategoryIndex> {
  if (!pending) {
    pending = fetchIndex().catch((error: unknown) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}
