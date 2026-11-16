import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";

/** A decoded quest for the quest detail page, extending DungeonQuest with the
 * dungeon instance id when any giver is inside a dungeon (for the dungeon page link).
 * The dungeon page's "Before you go" list (`pickupSteps`) isn't on the quest page. */
export interface QuestPageResult extends Omit<DungeonQuest, "pickupSteps"> {
  /** The dungeon instance id if at least one giver is inside a dungeon (Classic data). */
  dungeonInstanceId: number | null;
}
