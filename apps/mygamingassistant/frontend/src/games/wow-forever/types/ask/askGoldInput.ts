import type { FarmSort } from "@/games/wow-forever/gold/goldFarms";

/** A checked `gold_farming` input. */
export interface AskGoldInput {
  /** The level the player said; null = their saved level. */
  level: number | null;
  skinning: boolean;
  sort: FarmSort;
}
