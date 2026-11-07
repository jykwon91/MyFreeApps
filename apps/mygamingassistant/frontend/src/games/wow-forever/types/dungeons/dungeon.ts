import type { DungeonBoss } from "@/games/wow-forever/types/dungeons/dungeonBoss";
import type { DungeonEntranceZone } from "@/games/wow-forever/types/dungeons/dungeonEntranceZone";

/** One dungeon page: `/wow-forever/dungeons/:slug`. */
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
  /** The level the door lets you in at. */
  requiredLevel: number;
  entrances: readonly DungeonEntranceZone[];
  bosses: readonly DungeonBoss[];
}
