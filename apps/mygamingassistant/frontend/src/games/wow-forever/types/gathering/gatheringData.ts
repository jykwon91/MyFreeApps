import type { MiningFile } from "@/games/wow-forever/types/gathering/miningFile";
import type { ResolvedNode } from "@/games/wow-forever/types/gathering/resolvedNode";
import type { WorldZone } from "@/games/wow-forever/types/worldMap";

/** What a gathering guide loads: its nodes joined to the spawn data, Forever's zones, and its crafts file (if any). */
export interface GatheringData {
  nodes: readonly ResolvedNode[];
  zoneById: ReadonlyMap<number, WorldZone>;
  crafts: MiningFile | null;
}
