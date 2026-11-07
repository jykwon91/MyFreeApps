import type { QuestSource } from "@/games/wow-forever/types/recipeSources";

/** A quest that rewards the item. */
export interface ItemQuest extends QuestSource {
  /** Level to pick it up. */
  minLevel: number;
  /** "druid" when only one class gets it; "" for every class. */
  classes: string;
}
