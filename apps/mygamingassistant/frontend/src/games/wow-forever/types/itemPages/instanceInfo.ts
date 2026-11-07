import type { InstanceKind } from "@/games/wow-forever/types/itemPages/instanceKind";
import type { MobSpot } from "@/games/wow-forever/types/recipeSources";

/** A dungeon or raid, with its Forever level and where its door is. */
export interface InstanceInfo {
  id: number;
  name: string;
  kind: InstanceKind;
  /** Forever's level for it; 0 when unknown. */
  maxLevel: number;
  /** Level to enter; 0 when unknown. */
  requiredLevel: number;
  /** The entrance on the World Map; null when none is placed. */
  entrance: MobSpot | null;
}
