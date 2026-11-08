import { useCallback, useEffect, useState } from "react";
import { decodeQuestDetail } from "@/games/wow-forever/lib/quests/decodeQuestDetail";
import { loadDungeonInstanceSlugs } from "@/games/wow-forever/lib/quests/dungeonSlugForInstance";
import { loadQuestItems } from "@/games/wow-forever/lib/quests/loadQuestItems";
import { loadQuestSeen } from "@/games/wow-forever/lib/quests/loadQuestSeen";
import { loadQuestShard } from "@/games/wow-forever/lib/quests/loadQuestShard";
import { decodeZone } from "@/games/wow-forever/worldMap/decodeWorldMap";
import type { QuestDetailFile } from "@/games/wow-forever/types/quests/questDetailFile";
import type { QuestSeenFile } from "@/games/wow-forever/types/quests/questSeenFile";
import type { QuestPageResult } from "@/games/wow-forever/types/quests/questPageResult";
import type { WorldZone } from "@/games/wow-forever/types/worldMap";

interface ReadyState {
  status: "ready";
  quest: QuestPageResult;
  dungeonSlug: string | null;
}

interface NotFoundState {
  status: "not-found";
}

interface ErrorState {
  status: "error";
  retry: () => void;
  retrying: boolean;
}

export type QuestDetailState =
  | { status: "loading" }
  | ReadyState
  | NotFoundState
  | ErrorState;

interface LoadResult {
  quest: QuestPageResult | null;
  dungeonSlug: string | null;
}

function loadQuestData(questId: number): Promise<LoadResult> {
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

interface Loaded {
  questId: number;
  attempt: number;
  data: LoadResult | null;
}

/** Loads the quest detail for a given quest id. */
export function useQuestDetail(questId: number | null): QuestDetailState {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (questId === null) return;
    let live = true;
    loadQuestData(questId).then(
      (data) => live && setLoaded({ questId, attempt, data }),
      () => live && setLoaded({ questId, attempt, data: null }),
    );
    return () => {
      live = false;
    };
  }, [questId, attempt]);

  // No valid id in the URL → not found, not an error.
  if (questId === null) return { status: "not-found" };
  if (loaded === null || loaded.questId !== questId) return { status: "loading" };
  if (loaded.data === null) return { status: "error", retry, retrying: loaded.attempt !== attempt };
  if (loaded.data.quest === null) return { status: "not-found" };
  return { status: "ready", quest: loaded.data.quest, dungeonSlug: loaded.data.dungeonSlug };
}
