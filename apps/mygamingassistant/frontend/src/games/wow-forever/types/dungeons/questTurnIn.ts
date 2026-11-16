import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";

/** A quest's objectives and who takes it back: what MGA Dungeon Quests' "Next:" line says. */
export type QuestTurnIn = Pick<DungeonQuest, "objectives" | "enders">;
