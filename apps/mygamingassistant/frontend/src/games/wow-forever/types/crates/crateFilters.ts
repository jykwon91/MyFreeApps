import type { CrateTier } from "@/games/wow-forever/types/crates/crateTier";

/** The crates grid's filters; null = not filtering on it. */
export interface CrateFilters {
  tier: CrateTier | null;
}
