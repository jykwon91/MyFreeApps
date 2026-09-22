import type { ItemQuality, ItemSlot } from "@/games/wow-forever/data/itemSlots";
import type { StatValues } from "@/games/wow-forever/data/statKeys";

export interface WeaponStats {
  minDamage: number;
  maxDamage: number;
  /** Seconds between swings/shots. */
  speed: number;
}

/** Where the item's numbers came from — shown on the card. */
export type ItemSource = "manual" | "text" | "screenshot";

/** One item being compared. Lives only in the page's state; never sent anywhere. */
export interface CompareItem {
  id: string;
  name: string;
  slot: ItemSlot | null;
  itemType: string | null;
  quality: ItemQuality | null;
  armor: number | null;
  weapon: WeaponStats | null;
  stats: StatValues;
  /** Tooltip lines the reader couldn't turn into a stat (procs, Use:, unknowns). */
  unparsedEffects: string[];
  requiredLevel: number | null;
  setName: string | null;
  source: ItemSource;
  /** Reader warnings for the user (dropped/unknown values). */
  warnings: string[];
}
