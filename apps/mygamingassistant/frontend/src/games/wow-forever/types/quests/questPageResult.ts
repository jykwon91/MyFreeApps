import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";

/** A decoded quest for the quest detail page, extending DungeonQuest with the
 * dungeon instance id when any giver is inside a dungeon (for the dungeon page link). */
export interface QuestPageResult extends DungeonQuest {
  /** The dungeon instance id if at least one giver is inside a dungeon (Classic data). */
  dungeonInstanceId: number | null;
}
