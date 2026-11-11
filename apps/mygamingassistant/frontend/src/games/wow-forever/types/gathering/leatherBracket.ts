import type { ItemRef } from "@/games/wow-forever/types/itemRef";

/** Mob levels that skin into the same main leather (Classic data). */
export interface LeatherBracket {
  minLevel: number;
  maxLevel: number;
  /** Main leather first, then the others these levels give. */
  leathers: readonly ItemRef[];
}
