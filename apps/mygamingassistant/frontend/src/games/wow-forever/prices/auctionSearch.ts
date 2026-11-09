/** Filter and order the auction-house price list for the lookup page. Pure: no state, no clock. */
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { AuctionSearchResult } from "@/games/wow-forever/types/auctionSearchResult";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";

/** With nothing typed, the page shows this many of the top items. */
export const BROWSE_LIMIT = 50;
/** With a search, this many matches at most. */
export const SEARCH_LIMIT = 200;

type Compare = (a: AuctionPrice, b: AuctionPrice) => number;

const byName: Compare = (a, b) => a.name.localeCompare(b.name) || a.itemId - b.itemId;

const COMPARERS: Record<AuctionSort, Compare> = {
  supply: (a, b) => b.quantity - a.quantity || byName(a, b),
  high: (a, b) => b.marketValue - a.marketValue || byName(a, b),
  low: (a, b) => a.marketValue - b.marketValue || byName(a, b),
  name: byName,
};

function matches(item: AuctionPrice, needle: string): boolean {
  return item.name.toLowerCase().includes(needle) || String(item.itemId) === needle;
}

/** `limit` overrides the cap (the browse cap with nothing typed, else the search cap). */
export function searchAuctionItems(items: Iterable<AuctionPrice>, query: string, sort: AuctionSort, limit?: number): AuctionSearchResult {
  const needle = query.trim().toLowerCase();
  const found = needle ? [...items].filter((item) => matches(item, needle)) : [...items];
  found.sort(COMPARERS[sort]);
  const cap = limit ?? (needle ? SEARCH_LIMIT : BROWSE_LIMIT);
  return { items: found.slice(0, cap), total: found.length, capped: found.length > cap };
}
