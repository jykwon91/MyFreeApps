import type { DungeonBoss } from "@/games/wow-forever/types/dungeons/dungeonBoss";
import type { DungeonEntranceZone } from "@/games/wow-forever/types/dungeons/dungeonEntranceZone";
import type { DungeonEntryRequirement } from "@/games/wow-forever/types/dungeons/dungeonEntryRequirement";
import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";
import type { ForeverDungeonQuest } from "@/games/wow-forever/types/dungeons/foreverDungeonQuest";
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
  /**
   * A dungeon Forever added (`foreverDungeons.json`): the client gives its level
   * and bosses, Blizzard's Game Data API its quests (`foreverQuests`); no door, loot or entry rules.
   */
  newInForever: boolean;
  /** What players call it ("VC", "SFK"). */
  aliases: readonly string[];
  /** Forever's level (LFGDungeons → ContentTuning); usually one level. */
  levelMin: number;
  levelMax: number;
  /** The level the door lets you in at (Classic `areatrigger_teleport`); null when not known (a new Forever dungeon). */
  requiredLevel: number | null;
  /** The most players the instance lets in (Forever `Map.MaxPlayers`); null when the client has no cap. */
  maxPlayers: number | null;
  /** Doors that need an item or a finished quest (Classic); empty = only the level; null = not known (a new Forever dungeon). */
  entryRequirements: readonly DungeonEntryRequirement[] | null;
  /** Keys that open locked doors inside (Classic, from the interiors), each once. */
  lockedDoorKeys: readonly string[];
  /** Empty when we don't know where it is. */
  entrances: readonly DungeonEntranceZone[];
  bosses: readonly DungeonBoss[];
  /** The World Map's interior (bosses + doors), for the per-door "Inside · bosses & routes"; null when we have none. */
  interior: Interior | null;
  /** The dungeon's quests in Forever, lowest level first (both factions; the page filters). */
  quests: readonly DungeonQuest[];
  /** A new Forever dungeon's quests (Game Data API), seen level first then title; empty for a Classic dungeon. */
  foreverQuests: readonly ForeverDungeonQuest[];
}
