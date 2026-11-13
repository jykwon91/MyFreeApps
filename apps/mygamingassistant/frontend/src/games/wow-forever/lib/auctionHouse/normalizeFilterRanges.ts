import { normalizeRange } from "@/games/wow-forever/lib/auctionHouse/normalizeRange";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";

/**
 * The filters with the price and level ranges read low to high. The boxes keep
 * what was typed (swapping them mid-typing would move the numbers under the
 * cursor); the list and the active-filter chips use this. Pure.
 */
export function normalizeFilterRanges(filters: AuctionFilters): AuctionFilters {
  const [minGold, maxGold] = normalizeRange(filters.minGold, filters.maxGold);
  const [minLevel, maxLevel] = normalizeRange(filters.minLevel, filters.maxLevel);
  return { ...filters, minGold, maxGold, minLevel, maxLevel };
}
