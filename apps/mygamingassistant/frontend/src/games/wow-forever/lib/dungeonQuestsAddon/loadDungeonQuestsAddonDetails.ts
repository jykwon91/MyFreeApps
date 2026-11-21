import { questLines } from "@/games/wow-forever/lib/dungeons/questLines";
import { loadQuestDetail } from "@/games/wow-forever/lib/quests/loadQuestDetail";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import type { QuestTurnIn } from "@/games/wow-forever/types/dungeons/questTurnIn";
import { FACTION } from "@/games/wow-forever/types/worldMap";

/**
 * Every quest-line step's objectives and who takes it back, from the quest pages' data, keyed by quest
 * id: what MGA Dungeon Quests' "Next:" line says for a quest before a dungeon quest. A quest neither
 * source has is left out.
 */
export async function loadDungeonQuestsAddonDetails(
  dungeons: readonly Pick<Dungeon, "quests" | "foreverQuests">[],
): Promise<ReadonlyMap<number, QuestTurnIn>> {
  const ids = new Set(
    dungeons.flatMap((d) =>
      [FACTION.alliance, FACTION.horde].flatMap((f) => questLines(d.quests, f).flatMap((l) => l.steps.map((s) => s.id))).concat(
        d.foreverQuests.map((q) => q.id),
      ),
    ),
  );
  const loaded = await Promise.all([...ids].map(async (id) => [id, (await loadQuestDetail(id)).quest] as const));
  return new Map(loaded.flatMap(([id, quest]) => (quest ? [[id, { objectives: quest.objectives, enders: quest.enders }] as const] : [])));
}
