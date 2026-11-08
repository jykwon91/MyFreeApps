import { WOW_REGIONS } from "@/games/wow-forever/data/wowRegions";
import type { WowRegion } from "@/games/wow-forever/types/wowRegion";

/** "Americas", "Europe", … — how a region reads in a card and in what Claude is told. */
export function regionLabel(region: WowRegion): string {
  return WOW_REGIONS.find((r) => r.value === region)?.label ?? region;
}
