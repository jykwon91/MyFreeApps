import type { BisSlotId } from "@/games/wow-forever/data/bisLists/bisSlots";
import type { BisListItems } from "@/games/wow-forever/types/bisLists/bisListItems";

/** A list's rows after a pick, and the other rows the pick emptied. */
export interface PlacedBisItem {
  items: BisListItems;
  cleared: readonly BisSlotId[];
}
