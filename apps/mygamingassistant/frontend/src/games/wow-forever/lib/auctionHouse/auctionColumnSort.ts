/**
 * Column-header sort for the Auction House results table.
 * Pure: no state, no side effects.
 */
import type { AuctionColumnSort } from "@/games/wow-forever/types/auctionHouse/auctionColumnSort";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { SortDirection } from "@/games/wow-forever/types/professionTiers/sortDirection";

/** The natural first direction when clicking a column header for the first time. */
export const DEFAULT_COL_DIR: Record<AuctionColumnSort, SortDirection> = {
  item: "asc",
  market: "desc",
  cheapest: "desc",
  onsale: "desc",
  upgrade: "desc",
};

const COLUMN_SORT_VALUES: readonly AuctionColumnSort[] = ["item", "market", "cheapest", "onsale", "upgrade"];

export function parseAuctionColumnSort(raw: unknown): AuctionColumnSort | null {
  return COLUMN_SORT_VALUES.find((v) => v === raw) ?? null;
}

function byName(a: AuctionPrice, b: AuctionPrice): number {
  return a.name.localeCompare(b.name) || a.itemId - b.itemId;
}

function compareByColumn(a: AuctionPrice, b: AuctionPrice, colSort: AuctionColumnSort, dir: SortDirection): number {
  const asc = dir === "asc";

  if (colSort === "cheapest") {
    // Items with no cheapest listing (minBuyout === 0) always sort last in both directions.
    const aNull = a.minBuyout === 0;
    const bNull = b.minBuyout === 0;
    if (aNull && bNull) return byName(a, b);
    if (aNull) return 1;
    if (bNull) return -1;
    const diff = asc ? a.minBuyout - b.minBuyout : b.minBuyout - a.minBuyout;
    return diff || byName(a, b);
  }

  switch (colSort) {
    case "item": {
      const cmp = byName(a, b);
      return asc ? cmp : -cmp;
    }
    case "market": {
      const diff = asc ? a.marketValue - b.marketValue : b.marketValue - a.marketValue;
      return diff || byName(a, b);
    }
    case "onsale": {
      const diff = asc ? a.quantity - b.quantity : b.quantity - a.quantity;
      return diff || byName(a, b);
    }
    // "upgrade" sort is handled in AuctionLookup.tsx (needs character data); fall back to name.
    case "upgrade":
      return byName(a, b);
  }
}

/** A sorted copy. Never mutates `items`. */
export function sortByColumn(items: readonly AuctionPrice[], colSort: AuctionColumnSort, dir: SortDirection): AuctionPrice[] {
  return [...items].sort((a, b) => compareByColumn(a, b, colSort, dir));
}

/**
 * Returns the new colSort + colDir when the user clicks a column header.
 * Clicking the active column flips its direction; clicking a different column
 * resets to that column's natural first direction.
 */
export function toggleColumnSort(
  current: AuctionColumnSort | null,
  currentDir: SortDirection,
  clicked: AuctionColumnSort,
): { colSort: AuctionColumnSort; colDir: SortDirection } {
  if (current === clicked) {
    return { colSort: clicked, colDir: currentDir === "asc" ? "desc" : "asc" };
  }
  return { colSort: clicked, colDir: DEFAULT_COL_DIR[clicked] };
}
