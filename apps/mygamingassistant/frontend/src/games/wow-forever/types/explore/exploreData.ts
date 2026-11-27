import type { ExploreContinent } from "@/games/wow-forever/types/explore/exploreContinent";

/** `data/explore/explore.json`, written by `python -m scripts.wow_explore.build`: what Explore Azeroth counts. */
export interface ExploreData {
  readonly source: string;
  readonly attribution: string;
  readonly achievement: { readonly id: number; readonly name: string };
  readonly continents: readonly ExploreContinent[];
}
