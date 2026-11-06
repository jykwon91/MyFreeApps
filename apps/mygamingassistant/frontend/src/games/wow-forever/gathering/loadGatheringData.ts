import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import { loadZoneById } from "@/games/wow-forever/gathering/loadZoneById";
import { resolveNodes } from "@/games/wow-forever/gathering/resolveNodes";
import type { GatheringData } from "@/games/wow-forever/types/gathering/gatheringData";
import type { NodeGatheringGuide } from "@/games/wow-forever/types/gathering/nodeGatheringGuide";

/** The spawns (Classic, with Forever's Lock skills), Forever's zone levels, and the guide's crafts file. */
export async function loadGatheringData(guide: NodeGatheringGuide): Promise<GatheringData> {
  const [sources, zoneById, crafts] = await Promise.all([
    import("@/games/wow-forever/data/professions/crafting/classic/sources.json"),
    loadZoneById(),
    guide.crafts?.load() ?? Promise.resolve(null),
  ]);
  const lookup = createSourceLookup(sources.default as unknown as RawSourcesFile);
  return {
    nodes: resolveNodes(guide.nodes, (id) => lookup.reagent(id)),
    zoneById,
    crafts,
  };
}
