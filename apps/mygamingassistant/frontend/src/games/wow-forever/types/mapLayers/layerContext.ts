import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { GatheringMapSpot } from "@/games/wow-forever/types/mapLayers/gatheringMapSpot";
import type { Rare } from "@/games/wow-forever/types/rares/rare";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** Who the layers are drawn for. */
export interface LayerContext {
  faction: PlayerFaction;
  classId: WowClassId;
  level: number | null;
  /** The Gathering layers' spots; null until that file has loaded. */
  gathering: readonly GatheringMapSpot[] | null;
  /** The Rares layer's rares; null until their files have loaded. */
  rares: readonly Rare[] | null;
}
