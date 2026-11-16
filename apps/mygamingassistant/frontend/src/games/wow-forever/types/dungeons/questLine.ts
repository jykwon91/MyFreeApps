import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { QuestPickup } from "@/games/wow-forever/types/dungeons/questPickup";

/**
 * Every quest you pick up on the way to one or more dungeon quests, in order:
 * the quests before them, then the dungeon quests themselves (several when
 * they share exactly the same quests before them).
 */
export interface QuestLine {
  /** The first dungeon quest at the end of the line. */
  id: number;
  /** The dungeon quests at the end of the line. */
  titles: readonly string[];
  /** Empty = every class (from the first dungeon quest). */
  classes: readonly WowClassId[];
  steps: readonly QuestPickup[];
}
