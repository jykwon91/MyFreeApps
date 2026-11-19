import type { WritTier } from "@/games/wow-forever/types/writs/writTier";

/** The writs grid's filters; null / false = not filtering on it. */
export interface WritFilters {
  tier: WritTier | null;
  /** A recorded zone, or `WRIT_LOCATION_UNKNOWN` for writs with no recorded turn-in. */
  location: string | null;
  dealsOnly: boolean;
}
