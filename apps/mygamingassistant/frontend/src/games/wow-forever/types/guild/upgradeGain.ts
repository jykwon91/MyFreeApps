import type { StatKey } from "@/games/wow-forever/data/statKeys";

/** How much better a crafted item is than the worn one, in points of the wearer's best main stat: "+4 Intellect". */
export interface UpgradeGain {
  points: number;
  stat: StatKey;
}
