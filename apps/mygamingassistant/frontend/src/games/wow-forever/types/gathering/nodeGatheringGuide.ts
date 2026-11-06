import type { GatheringCrafts } from "@/games/wow-forever/types/gathering/gatheringCrafts";
import type { GatheringGuideBase } from "@/games/wow-forever/types/gathering/gatheringGuideBase";
import type { GATHERING_KIND } from "@/games/wow-forever/types/gathering/gatheringKind";
import type { GatheringNode } from "@/games/wow-forever/types/gathering/gatheringNode";

/** A guide that gathers from nodes on the ground (Mining, Herbalism): what's orange or yellow at your skill, and where it spawns. */
export interface NodeGatheringGuide extends GatheringGuideBase {
  kind: typeof GATHERING_KIND.nodes;
  /** "Ore" / "Herb" — the full table's first column. */
  nodeLabel: string;
  /** Lowest skill first. */
  nodes: readonly GatheringNode[];
  crafts: GatheringCrafts | null;
}
