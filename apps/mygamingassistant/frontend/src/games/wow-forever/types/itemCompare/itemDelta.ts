import type { StatDelta } from "@/games/wow-forever/types/itemCompare/statDelta";

/** What changes when the candidate replaces an equipped item. A field at 0 / empty / null means "no change". */
export interface ItemDelta {
  /** In stat-key order. */
  stats: StatDelta[];
  armor: number;
  /** Damage per second, one decimal; null when either item has no known weapon damage. */
  dps: number | null;
}
