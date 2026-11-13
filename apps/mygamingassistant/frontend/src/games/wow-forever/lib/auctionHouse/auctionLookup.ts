/** The Auction house list: which items to show, filtered and sorted. Pure. */
import { filterAuctionItems, sortAuctionItems } from "@/games/wow-forever/prices/auctionSearch";
import type { AuctionFilterContext } from "@/games/wow-forever/types/auctionHouse/auctionFilterContext";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { AuctionLookupResult } from "@/games/wow-forever/types/auctionHouse/auctionLookupResult";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";

/** The materials that have auctions, and how many matching ones don't. */
function materialsOnSale(
  materials: ReadonlyMap<number, string>,
  byId: ReadonlyMap<number, AuctionPrice>,
  query: string,
): { pool: AuctionPrice[]; notOnSale: number } {
  const needle = query.trim().toLowerCase();
  const pool: AuctionPrice[] = [];
  let notOnSale = 0;
  for (const [id, name] of materials) {
    const price = byId.get(id);
    if (price) pool.push(price);
    else if (!needle || name.toLowerCase().includes(needle) || String(id) === needle) notOnSale += 1;
  }
  return { pool, notOnSale };
}

/**
 * Every item on the house (or, with `materials`, only those a profession's recipes
 * use) that matches the search and filters, in the chosen order. `notOnSale` counts
 * the profession materials the search matches that have no auctions.
 */
export function lookupAuctionItems(
  byId: ReadonlyMap<number, AuctionPrice>,
  materials: ReadonlyMap<number, string> | null,
  filters: AuctionFilters,
  context: AuctionFilterContext,
): AuctionLookupResult {
  const { pool, notOnSale } = materials ? materialsOnSale(materials, byId, filters.query) : { pool: byId.values(), notOnSale: 0 };
  const items = sortAuctionItems(filterAuctionItems(pool, filters, context), filters.sort, context.qualityOf);
  return { items, notOnSale };
}
