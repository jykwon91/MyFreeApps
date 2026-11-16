import type { QuestGiver } from "@/games/wow-forever/types/dungeons/questGiver";

/** One quest to pick up in a dungeon quest's line: a quest before it, or a quest the dungeon page lists. */
export interface QuestPickup {
  id: number;
  title: string;
  level: number;
  minLevel: number;
  /** Who starts it; null when that isn't in our data. */
  giver: QuestGiver | null;
  /** True for a quest the dungeon page lists (one you finish in there). */
  dungeonQuest: boolean;
}
