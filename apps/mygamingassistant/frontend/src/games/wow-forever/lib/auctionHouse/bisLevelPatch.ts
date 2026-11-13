import { MAX_FILTER_LEVEL, MIN_FILTER_LEVEL } from "@/games/wow-forever/data/auctionHouse/auctionFilterOptions";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { BisChoice } from "@/games/wow-forever/types/auctionHouse/bisChoice";

/** A level the box accepts: 1-60, no leading zero. Pure. */
export function parseBisLevelText(raw: string): number | null {
  const text = raw.trim();
  if (!/^[1-9]\d?$/.test(text)) return null;
  const level = Number(text);
  return level >= MIN_FILTER_LEVEL && level <= MAX_FILTER_LEVEL ? level : null;
}

/**
 * What the top picks' level box changes once committed (Enter or leaving it).
 * Empty = back to the player's saved level; a level 1-60 picks for it, and turns
 * the picks on ("any top 3") if they were off, since the level means nothing
 * without them; anything else (out of range, not a whole number) changes
 * nothing. Pure.
 */
export function bisLevelPatch(raw: string, current: BisChoice | null): Partial<AuctionFilters> | null {
  if (raw.trim() === "") return { bisLevel: null };
  const level = parseBisLevelText(raw);
  if (level === null) return null;
  return { bisLevel: level, bis: current ?? "any" };
}
