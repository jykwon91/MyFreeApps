import type { QuestGiver } from "@/games/wow-forever/types/dungeons/questGiver";
import type { Faction } from "@/games/wow-forever/types/worldMap";

/** A quest before a dungeon quest in its line, with who gives it and where (Classic data). */
export interface QuestPickupStep {
  id: number;
  title: string;
  level: number;
  minLevel: number;
  side: Faction;
  /** Who starts it; null when that isn't in our data. */
  giver: QuestGiver | null;
}
