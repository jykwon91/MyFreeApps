import type { QuestPageResult } from "@/games/wow-forever/types/quests/questPageResult";

/** A quest page's data: the quest (null when neither Classic nor the seen overlay has it) and its dungeon's slug. */
export interface QuestDetailLoad {
  quest: QuestPageResult | null;
  dungeonSlug: string | null;
}
