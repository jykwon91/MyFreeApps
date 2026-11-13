import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";

/** True when the list keeps only gear one class can equip: a class picked on the page, or an old `?usable=1` link. Pure. */
export function usableFilterOn(filters: Pick<AuctionFilters, "usable" | "classId">): boolean {
  return filters.usable || filters.classId !== null;
}

/** The class the gear filters and top picks are for: the one picked on the page, else the player's own. Pure. */
export function gearClassFor(filters: Pick<AuctionFilters, "classId">, playerClass: WowClassId): WowClassId {
  return filters.classId ?? playerClass;
}
