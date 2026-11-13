/** Filter and order the auction-house price list for the lookup page. Pure: no state, no clock. */
import { COPPER_PER_GOLD } from "@/games/wow-forever/crafting/matPrices";
import { BROWSE_LIMIT, SEARCH_LIMIT } from "@/games/wow-forever/data/auctionHouse/auctionFilterOptions";
import { categoryFilterActive, gearFilterActive } from "@/games/wow-forever/lib/auctionHouse/auctionActiveFilters";
import { inCategory } from "@/games/wow-forever/lib/auctionHouse/itemCategoryLookup";
import { normalizeFilterRanges } from "@/games/wow-forever/lib/auctionHouse/normalizeFilterRanges";
import { usableByClass } from "@/games/wow-forever/lib/auctionHouse/usableByClass";
import { ITEM_QUALITIES } from "@/games/wow-forever/data/itemSlots";
import type { ItemQuality } from "@/games/wow-forever/data/itemSlots";
import type { AuctionFilterContext } from "@/games/wow-forever/types/auctionHouse/auctionFilterContext";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { BisPick } from "@/games/wow-forever/types/auctionHouse/bisPick";
import type { AuctionPriceCompare } from "@/games/wow-forever/types/auctionHouse/auctionPriceCompare";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { AuctionSearchResult } from "@/games/wow-forever/types/auctionSearchResult";
import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

const byName: AuctionPriceCompare = (a, b) => a.name.localeCompare(b.name) || a.itemId - b.itemId;

/** Rarer first; an item the icon map doesn't know ranks below Poor. */
function qualityRank(qualityOf: AuctionFilterContext["qualityOf"], itemId: number): number {
  const quality: ItemQuality | null = qualityOf(itemId);
  return quality === null ? -1 : ITEM_QUALITIES.indexOf(quality);
}

/** How far the cheapest auction sits under the market value; 0 when the cheapest is unknown (0 = unknown). */
function gap(item: AuctionPrice): number {
  return item.minBuyout > 0 ? item.marketValue - item.minBuyout : 0;
}

function comparerFor(sort: AuctionSort, qualityOf: AuctionFilterContext["qualityOf"]): AuctionPriceCompare {
  switch (sort) {
    case "supply":
      return (a, b) => b.quantity - a.quantity || byName(a, b);
    case "listings":
      return (a, b) => b.listings - a.listings || byName(a, b);
    case "high":
      return (a, b) => b.marketValue - a.marketValue || byName(a, b);
    case "low":
      return (a, b) => a.marketValue - b.marketValue || byName(a, b);
    case "gap":
      return (a, b) => gap(b) - gap(a) || byName(a, b);
    case "quality":
      return (a, b) => qualityRank(qualityOf, b.itemId) - qualityRank(qualityOf, a.itemId) || byName(a, b);
    case "name":
      return byName;
  }
}

/** A sorted copy. */
export function sortAuctionItems(items: readonly AuctionPrice[], sort: AuctionSort, qualityOf: AuctionFilterContext["qualityOf"]): AuctionPrice[] {
  return [...items].sort(comparerFor(sort, qualityOf));
}

function matchesQuery(item: AuctionPrice, needle: string): boolean {
  return needle === "" || item.name.toLowerCase().includes(needle) || String(item.itemId) === needle;
}

function inGoldRange(item: AuctionPrice, filters: AuctionFilters): boolean {
  const { minGold, maxGold } = filters;
  if (minGold !== null && item.marketValue < Math.round(minGold * COPPER_PER_GOLD)) return false;
  return maxGold === null || item.marketValue <= Math.round(maxGold * COPPER_PER_GOLD);
}

function inLevelRange(gear: ClientItem, filters: AuctionFilters): boolean {
  if (filters.minLevel !== null && gear.requiredLevel < filters.minLevel) return false;
  return filters.maxLevel === null || gear.requiredLevel <= filters.maxLevel;
}

/** The gear filters. An item the game's item list doesn't have is not gear, so any gear filter leaves it out. */
function matchesGear(item: AuctionPrice, filters: AuctionFilters, context: AuctionFilterContext, gear: ReadonlyMap<number, ClientItem>): boolean {
  const found = gear.get(item.itemId);
  if (!found) return false;
  if (filters.slot !== null && found.slot !== filters.slot) return false;
  if (filters.itemType !== null && found.itemType !== filters.itemType) return false;
  if (!inLevelRange(found, filters)) return false;
  return !filters.usable || usableByClass(found, context.classId);
}

/** The top-picks filter: the item is one of the picks, at the asked rank (any of the three for "any"). */
function matchesBis(item: AuctionPrice, filters: AuctionFilters, picks: ReadonlyMap<number, BisPick>): boolean {
  const pick = picks.get(item.itemId);
  return pick !== undefined && (filters.bis === "any" || pick.rank === filters.bis);
}

/**
 * The items that match the search and every filter that is on (a filter left off
 * lets everything through), in the order given. A reversed price or level range is read low to high. Gear filters wait for
 * `context.gear`, the top-picks filter for `context.bisPicks` and the category filter for `context.categories`: until those have loaded they don't apply.
 */
export function filterAuctionItems(items: Iterable<AuctionPrice>, asked: AuctionFilters, context: AuctionFilterContext): AuctionPrice[] {
  const filters = normalizeFilterRanges(asked);
  const needle = filters.query.trim().toLowerCase();
  const gear = gearFilterActive(filters) ? context.gear : null;
  const bisPicks = filters.bis === null ? null : context.bisPicks;
  const categories = categoryFilterActive(filters) ? context.categories : null;
  return [...items].filter((item) => {
    if (!matchesQuery(item, needle) || !inGoldRange(item, filters)) return false;
    if (filters.minQuantity !== null && item.quantity < filters.minQuantity) return false;
    if (filters.minListings !== null && item.listings < filters.minListings) return false;
    if (filters.qualities.length > 0 && !filters.qualities.includes(context.qualityOf(item.itemId) ?? "unknown")) return false;
    if (categories !== null && !inCategory(item.itemId, filters, categories)) return false;
    if (bisPicks !== null && !matchesBis(item, filters, bisPicks)) return false;
    return gear === null || matchesGear(item, filters, context, gear);
  });
}

const NO_QUALITY: AuctionFilterContext["qualityOf"] = () => null;

/** `limit` overrides the cap (the browse cap with nothing typed, else the search cap). For callers that show a short, capped list. */
export function searchAuctionItems(items: Iterable<AuctionPrice>, query: string, sort: AuctionSort, limit?: number): AuctionSearchResult {
  const needle = query.trim().toLowerCase();
  const found = sortAuctionItems([...items].filter((item) => matchesQuery(item, needle)), sort, NO_QUALITY);
  const cap = limit ?? (needle ? SEARCH_LIMIT : BROWSE_LIMIT);
  return { items: found.slice(0, cap), total: found.length, capped: found.length > cap };
}
