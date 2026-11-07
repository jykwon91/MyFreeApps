import type { InstanceInfo } from "@/games/wow-forever/types/itemPages/instanceInfo";
import type { InstanceMobKind } from "@/games/wow-forever/types/itemPages/instanceMobKind";

/** A mob inside a dungeon or raid that drops the item. */
export interface InstanceDrop {
  name: string;
  minLevel: number;
  maxLevel: number;
  /** Percent per kill (Classic). */
  chance: number;
  kind: InstanceMobKind;
  instance: InstanceInfo;
}
