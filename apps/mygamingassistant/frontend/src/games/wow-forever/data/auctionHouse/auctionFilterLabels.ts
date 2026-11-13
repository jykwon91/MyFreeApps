import { QUALITY_LABELS } from "@/games/wow-forever/data/itemQualityStyles";
import type { AuctionQualityFilter } from "@/games/wow-forever/types/auctionHouse/auctionQualityFilter";

/** Names for the quality chips; `unknown` = items the game's icon map has no entry for. */
export const QUALITY_FILTER_LABELS: Record<AuctionQualityFilter, string> = {
  ...QUALITY_LABELS,
  unknown: "Unknown",
};

/** The phone's filter sheet. */
export const FILTER_SHEET_COPY = {
  title: "Filters",
  clearAll: "Clear all",
  apply: "Apply",
} as const;

/** Legends, field labels and copy of the filter panel and its gear group. */
/** The list's load-failure messages. */
export const AUCTION_LOAD_COPY = {
  pricesError: "Couldn't load auction prices.",
  gearError: "Couldn't load the gear list.",
  categoryError: "Couldn't load the item categories.",
} as const;

export const FILTER_PANEL_COPY = {
  quality: "Quality",
  price: "Price (market value, in gold)",
  fromGold: "From gold",
  toGold: "To gold",
  quantity: "Units on sale",
  listings: "Auctions listing it",
  category: "Category",
  categoryLoading: "Loading item categories",
  categoryError: "Couldn't load the item categories.",
  gearCategoryHint: "Narrow gear down by slot, armor or weapon type and level with the Gear filters below.",
  gearToggle: "Gear filters",
  slot: "Slot",
  type: "Armor or weapon type",
  level: "Required level",
  fromLevel: "From level",
  toLevel: "To level",
  classGroup: "Class",
  gearLoading: "Loading gear filters",
  gearError: "Couldn't load the gear list.",
} as const;

/** The legend over a category's subclass chips. */
export function subcategoryLegend(categoryLabel: string): string {
  return `Kind of ${categoryLabel.toLowerCase()}`;
}

/** The chip that clears the subclass choice. */
export function allSubcategoriesLabel(categoryLabel: string): string {
  return `All ${categoryLabel.toLowerCase()}`;
}

/** The label of the "usable by my class" chip. */
export function usableChipLabel(classLabel: string): string {
  return `Usable by my class (${classLabel})`;
}

/** The search row, the active-filter chips, the list and its states. */
export const AUCTION_LIST_COPY = {
  searchLabel: "Search items",
  searchPlaceholder: "Item name or item id",
  sortLabel: "Sort by",
  filtersButton: "Filters",
  activeFilters: "Active filters",
  clearAll: "Clear all",
  clearFilters: "Clear filters",
  pricesError: "Couldn't load auction prices.",
  staleTitle: "These prices are old.",
  staleSuffix: ", so some of what you see may no longer be on sale.",
  staleUnknownAge: "We can't tell when Blizzard's snapshot was taken",
} as const;

export function removeFilterLabel(label: string): string {
  return `Remove filter: ${label}`;
}

export function filtersOnLabel(count: number): string {
  return `${count} on`;
}

export function staleAgeText(relative: string): string {
  return `Blizzard's snapshot is from ${relative}`;
}

export function noPricesText(houseLabel: string): string {
  return `No ${houseLabel} auction prices yet.`;
}

export function showMoreText(next: number): string {
  return `Show ${next} more`;
}

export function showMoreLeftText(remaining: string): string {
  return ` (${remaining} left)`;
}

export function showingFirstText(shown: string): string {
  return ` · showing the first ${shown}`;
}

export function notOnSaleText(count: number): string {
  return ` · ${count} more have no auctions right now`;
}
