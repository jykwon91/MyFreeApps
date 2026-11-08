import type { DungeonBoss } from "@/games/wow-forever/types/dungeons/dungeonBoss";
import type { DungeonEntranceZone } from "@/games/wow-forever/types/dungeons/dungeonEntranceZone";
import type { DungeonEntryRequirement } from "@/games/wow-forever/types/dungeons/dungeonEntryRequirement";
import type { Interior } from "@/games/wow-forever/worldMap/interiors";

/**
 * One dungeon page: `/wow-forever/dungeons/:slug`. Each section of the page
 * reads one group of fields; a later section (quests) adds its own field here.
 */
export interface Dungeon {
  slug: string;
  /** Instance map id. */
  instanceId: number;
  name: string;
  /** What players call it ("VC", "SFK"). */
  aliases: readonly string[];
  /** Forever's level (LFGDungeons → ContentTuning); usually one level. */
  levelMin: number;
  levelMax: number;
  /** The level the door lets you in at (Classic `areatrigger_teleport`). */
  requiredLevel: number;
  /** The most players the instance lets in (Forever `Map.MaxPlayers`); null when the client has no cap. */
  maxPlayers: number | null;
  /** Doors that need an item or a finished quest (Classic); empty = only the level. */
  entryRequirements: readonly DungeonEntryRequirement[];
  /** Keys that open locked doors inside (Classic, from the interiors), each once. */
  lockedDoorKeys: readonly string[];
  entrances: readonly DungeonEntranceZone[];
  bosses: readonly DungeonBoss[];
  /** The World Map's interior (bosses + doors), for the per-door "Inside · bosses & routes"; null when we have none. */
  interior: Interior | null;
}
