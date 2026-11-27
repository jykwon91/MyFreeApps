import type { ExploreZone } from "@/games/wow-forever/types/explore/exploreZone";

/** "Explore Eastern Kingdoms" or "Explore Kalimdor": every zone achievement it needs. `continent` is 0 or 1. */
export interface ExploreContinent {
  readonly achievement: number;
  readonly name: string;
  readonly continent: number;
  readonly zones: readonly ExploreZone[];
}
