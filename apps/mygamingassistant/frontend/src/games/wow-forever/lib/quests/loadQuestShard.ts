import { CLASSIC_QUEST_SHARDS } from "@/games/wow-forever/data/quests/questShards";
import type { QuestDetailFile } from "@/games/wow-forever/types/quests/questDetailFile";
import { QUEST_SHARD_COUNT } from "@/games/wow-forever/data/quests/questsConfig";

const shardCache = new Map<number, Promise<QuestDetailFile>>();

/** Loads the shard for a given quest id (`id % 64`), cached after first load. */
export function loadQuestShard(questId: number): Promise<QuestDetailFile> {
  const n = questId % QUEST_SHARD_COUNT;
  const cached = shardCache.get(n);
  if (cached) return cached;

  const key = `./classic/${String(n).padStart(2, "0")}.json`;
  const loader = CLASSIC_QUEST_SHARDS[key];
  if (!loader) return Promise.reject(new Error(`No shard for quest ${questId} (key ${key})`));

  const promise = loader().catch((err) => {
    shardCache.delete(n);
    throw err;
  });
  shardCache.set(n, promise);
  return promise;
}
