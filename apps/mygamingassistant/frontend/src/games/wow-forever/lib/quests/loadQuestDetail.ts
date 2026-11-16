import { decodeQuestDetail } from "@/games/wow-forever/lib/quests/decodeQuestDetail";
import { loadDungeonInstanceSlugs } from "@/games/wow-forever/lib/quests/dungeonSlugForInstance";
import { loadQuestItems } from "@/games/wow-forever/lib/quests/loadQuestItems";
import { loadQuestSeen } from "@/games/wow-forever/lib/quests/loadQuestSeen";
import { loadQuestShard } from "@/games/wow-forever/lib/quests/loadQuestShard";
import { decodeZone } from "@/games/wow-forever/worldMap/decodeWorldMap";
import type { QuestDetailFile } from "@/games/wow-forever/types/quests/questDetailFile";
import type { QuestDetailLoad } from "@/games/wow-forever/types/quests/questDetailLoad";
import type { QuestSeenFile } from "@/games/wow-forever/types/quests/questSeenFile";
import type { WorldZone } from "@/games/wow-forever/types/worldMap";

/** One quest's page data (Classic shard + seen overlay): null `quest` when neither has it. Used by the quest page and the MGA Dungeon Quests addon's data. */
export function loadQuestDetail(questId: number): Promise<QuestDetailLoad> {
  return Promise.all([
    loadQuestShard(questId),
    loadQuestSeen(),
    loadQuestItems(),
    loadDungeonInstanceSlugs(),
    // Zones are embedded in the shard-decode step via zone names from classicQuests.
    // We use the zones from the world map but keep it lightweight:
    import("@/games/wow-forever/data/worldMap/zones.json"),
  ]).then(([shard, seenFile, itemsMap, instanceSlugs, zonesFile]) => {
    // Build a zone id → WorldZone map from zones.json
    const zonesArr = (zonesFile.default as { zones: unknown[] }).zones;
    const zones: WorldZone[] = zonesArr.map(decodeZone);
    const zoneMap = new Map<number, WorldZone>(zones.map((z) => [z.id, z]));

    const seenTyped = seenFile as unknown as QuestSeenFile;
    const shardTyped = shard as unknown as QuestDetailFile;
    const questItems = new Map(
      Array.from(itemsMap.entries()).map(([id, item]) => [id, { name: item.name, slot: item.slot }]),
    );

    const quest = decodeQuestDetail(questId, shardTyped, seenTyped, zoneMap, questItems);
    if (!quest) return { quest: null, dungeonSlug: null };

    const dungeonSlug = quest.dungeonInstanceId !== null ? (instanceSlugs.get(quest.dungeonInstanceId) ?? null) : null;
    return { quest, dungeonSlug };
  });
}
