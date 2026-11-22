import { CLASSIC_QUEST_SHARDS } from "@/games/wow-forever/data/quests/questShards";
import { QUEST_SHARD_COUNT } from "@/games/wow-forever/data/quests/questsConfig";
import { loadQuestSeen } from "@/games/wow-forever/lib/quests/loadQuestSeen";
import type { QuestDetailFile } from "@/games/wow-forever/types/quests/questDetailFile";

export interface QuestItemObjective {
  readonly itemId: number;
  readonly count: number;
}

/**
 * All item objectives from Classic quest shards and Forever seen quests, keyed by quest ID.
 * Used by `addonPriceLua` to build the `questItems` section of `Data.lua`.
 */
export async function loadQuestItemObjectives(): Promise<ReadonlyMap<number, readonly QuestItemObjective[]>> {
  const [shards, seen] = await Promise.all([
    Promise.all(
      Array.from({ length: QUEST_SHARD_COUNT }, (_, n) => {
        const key = `./classic/${String(n).padStart(2, "0")}.json`;
        const loader = CLASSIC_QUEST_SHARDS[key];
        return loader ? loader() : Promise.resolve<QuestDetailFile | null>(null);
      }),
    ),
    loadQuestSeen(),
  ]);

  const result = new Map<number, QuestItemObjective[]>();

  const merge = (questId: number, itemId: number, count: number) => {
    const existing = result.get(questId);
    if (existing) {
      if (!existing.some((e) => e.itemId === itemId)) existing.push({ itemId, count });
    } else {
      result.set(questId, [{ itemId, count }]);
    }
  };

  for (const shard of shards) {
    if (!shard) continue;
    const { questColumns: qcols, objectiveColumns: ocols, quests } = shard;
    const objIdx = qcols.indexOf("objectives");
    const kindIdx = ocols.indexOf("kind");
    const itemIdIdx = ocols.indexOf("id");
    const countIdx = ocols.indexOf("count");
    if (objIdx < 0 || kindIdx < 0 || itemIdIdx < 0 || countIdx < 0) continue;

    for (const [questIdStr, row] of Object.entries(quests)) {
      if (!row) continue;
      const questId = Number(questIdStr);
      const objectives = row[objIdx];
      if (!Array.isArray(objectives)) continue;
      for (const obj of objectives) {
        if (!Array.isArray(obj) || obj[kindIdx] !== "item") continue;
        const itemId = Number(obj[itemIdIdx]);
        const count = Number(obj[countIdx]);
        if (itemId > 0) merge(questId, itemId, count);
      }
    }
  }

  // Add Forever seen quest objectives (may add new quests or new items to existing ones)
  const { columns: seenCols, quests: seenQuests } = seen;
  const seenObjIdx = seenCols.indexOf("objectives");
  if (seenObjIdx >= 0) {
    for (const [questIdStr, row] of Object.entries(seenQuests)) {
      const questId = Number(questIdStr);
      const objectives = row[seenObjIdx];
      if (!Array.isArray(objectives)) continue;
      for (const obj of objectives) {
        if (!Array.isArray(obj) || obj[0] !== "item") continue;
        const itemId = Number(obj[1]);
        const count = Number(obj[2]);
        if (itemId > 0) merge(questId, itemId, count);
      }
    }
  }

  return result;
}
