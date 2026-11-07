import type { BisSlotId } from "@/games/wow-forever/data/bisLists/bisSlots";
import type { SharedBisList } from "@/games/wow-forever/types/bisLists/sharedBisList";

/** One of the player's saved lists. */
export interface BisList extends SharedBisList {
  id: string;
  /** Rows the player has ticked "I have it" — never shared. */
  obtained: readonly BisSlotId[];
  /** Epoch ms of the last change. */
  updatedAt: number;
}
