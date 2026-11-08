import type { RACE_FACTION } from "@/games/wow-forever/data/races/racesConfig";

/** A playable race's faction. */
export type RaceFaction = (typeof RACE_FACTION)[keyof typeof RACE_FACTION];
