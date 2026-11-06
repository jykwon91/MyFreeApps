import type { GatheringNode } from "@/games/wow-forever/types/gathering/gatheringNode";
import type { NodeThresholds } from "@/games/wow-forever/types/gathering/nodeThresholds";
import type { ObjectSpot } from "@/games/wow-forever/types/recipeSources";

/** A guide's node joined to the generated data: its colour thresholds and where it spawns (most first). */
export interface ResolvedNode {
  node: GatheringNode;
  thresholds: NodeThresholds;
  spots: readonly ObjectSpot[];
}
