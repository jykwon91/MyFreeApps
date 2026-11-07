import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import type { GatheringMapSpot } from "@/games/wow-forever/types/mapLayers/gatheringMapSpot";
import { gatheringMapSpots } from "@/games/wow-forever/worldMap/gatheringMapSpots";

/** The Gathering layers' spots — the crafting sources file is big, so it loads only when a player asks for herbs or ore. */
export async function loadGatheringMapSpots(): Promise<GatheringMapSpot[]> {
  const sources = await import("@/games/wow-forever/data/professions/crafting/classic/sources.json");
  const lookup = createSourceLookup(sources.default as unknown as RawSourcesFile);
  return gatheringMapSpots((itemId) => lookup.reagent(itemId));
}
