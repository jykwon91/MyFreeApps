import { QUEST_TARGET_KIND } from "@/games/wow-forever/types/dungeons/questTargetKind";

/** The verb MGA Dungeon Quests puts before an objective, by its kind. */
export const OBJECTIVE_VERB = {
  [QUEST_TARGET_KIND.npc]: "Kill",
  [QUEST_TARGET_KIND.object]: "Use",
  [QUEST_TARGET_KIND.item]: "Collect",
} as const;
