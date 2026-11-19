import { CLASSIC_QUEST_SHARDS } from "@/games/wow-forever/data/quests/questShards";
import zonesFile from "@/games/wow-forever/data/worldMap/zones.json";
import { turnInSpots } from "@/games/wow-forever/lib/dungeonQuestsAddon/turnInSpots";
import { decodeZone } from "@/games/wow-forever/worldMap/decodeWorldMap";
import type { TurnInSpot } from "@/games/wow-forever/types/dungeons/turnInSpot";
import type { QuestDetailFile } from "@/games/wow-forever/types/quests/questDetailFile";

/** Every quest's turn-in spot we know, from all the quest shards: MGA Dungeon Quests' TurnIns.lua. */
export async function loadTurnInSpots(): Promise<Map<number, TurnInSpot>> {
  const shards = await Promise.all(Object.values(CLASSIC_QUEST_SHARDS).map((load) => load()));
  const zones = (zonesFile as { zones: unknown[] }).zones.map(decodeZone);
  return turnInSpots(shards as QuestDetailFile[], new Map(zones.map((z) => [z.id, z.name])));
}
