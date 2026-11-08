import type { RACIAL_KIND } from "@/games/wow-forever/data/races/racesConfig";

/** A racial you press (active) or one that's always on (passive). */
export type RacialKind = (typeof RACIAL_KIND)[keyof typeof RACIAL_KIND];
