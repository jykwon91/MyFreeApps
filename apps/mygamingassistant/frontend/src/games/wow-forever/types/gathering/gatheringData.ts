import type { MiningFile } from "@/games/wow-forever/types/gathering/miningFile";
import type { ResolvedNode } from "@/games/wow-forever/types/gathering/resolvedNode";
import type { ZonedData } from "@/games/wow-forever/types/gathering/zonedData";

/** What a node guide loads: its nodes joined to the spawn data, Forever's zones, and its crafts file (if any). */
export interface GatheringData extends ZonedData {
  nodes: readonly ResolvedNode[];
  crafts: MiningFile | null;
}
