import type { NodeColorOffsets } from "@/games/wow-forever/types/gathering/nodeColorOffsets";

/**
 * One kind of node a gathering guide sends you to — an ore vein or an herb.
 * Its required skill is never typed here: it is the Forever client's Lock
 * skill, read from the `objectSpots` rows of `itemId` named `node`.
 */
export interface GatheringNode {
  /** "Copper" — what the guide calls it. */
  name: string;
  /** The item it gives (Copper Ore); its sources list the node's spawns. */
  itemId: number;
  /** The node's name in the spawn data ("Copper Vein"). */
  node: string;
  /** Spawns now and then in place of a common node (Silver, Gold, Truesilver) — never a zone to go to for it. */
  rare?: boolean;
  /** Classic colour offsets when the node doesn't follow the usual +25 / +50 / +100 (Rich Thorium). */
  offsets?: NodeColorOffsets;
}
