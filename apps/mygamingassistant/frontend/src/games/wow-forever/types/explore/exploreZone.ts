import type { ExploreArea } from "@/games/wow-forever/types/explore/exploreArea";

/** A zone's "Explore <Zone>" achievement and the areas it counts. `map` is the zone's UiMap id. */
export interface ExploreZone {
  readonly achievement: number;
  readonly name: string;
  readonly map: number;
  readonly areas: readonly ExploreArea[];
}
