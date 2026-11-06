import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import { resolveNodes } from "@/games/wow-forever/gathering/resolveNodes";
import type { GatheringData } from "@/games/wow-forever/types/gathering/gatheringData";
import type { GatheringGuide } from "@/games/wow-forever/types/gathering/gatheringGuide";
import { decodeZone } from "@/games/wow-forever/worldMap/decodeWorldMap";

/** The spawns (Classic, with Forever's Lock skills), Forever's zone levels, and the guide's crafts file. */
export async function loadGatheringData(guide: GatheringGuide): Promise<GatheringData> {
  const [sources, zones, crafts] = await Promise.all([
    import("@/games/wow-forever/data/professions/crafting/classic/sources.json"),
    import("@/games/wow-forever/data/worldMap/zones.json"),
    guide.crafts?.load() ?? Promise.resolve(null),
  ]);
  const lookup = createSourceLookup(sources.default as unknown as RawSourcesFile);
  const decoded = (zones.default.zones as readonly unknown[]).map(decodeZone);
  return {
    nodes: resolveNodes(guide.nodes, (id) => lookup.reagent(id)),
    zoneById: new Map(decoded.map((z) => [z.id, z])),
    crafts,
  };
}
