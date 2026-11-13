import type { StatDelta } from "@/games/wow-forever/types/itemCompare/statDelta";

/** What changes when the candidate replaces an equipped item. A field at 0 / empty / null means "no change". */
export interface ItemDelta {
  /** In stat-key order. */
  stats: StatDelta[];
  armor: number;
  /** Damage per second, one decimal; null when either item has no known weapon damage. */
  dps: number | null;
  /** Either item has effects the game files list only as a count (procs, on-use, some Equip:), so they aren't compared. */
  otherEffects: boolean;
  /** Either item is a weapon whose damage the game files don't give, so damage isn't compared. */
  damageNotCompared: boolean;
}
