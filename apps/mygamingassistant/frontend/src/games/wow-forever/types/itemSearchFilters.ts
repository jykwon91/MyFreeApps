import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import type { WeightBracket } from "@/games/wow-forever/data/weights/statWeights";

/** What the item search narrows and orders by, besides the typed name. */
export interface ItemSearchFilters {
  slot: ItemSlot | null;
  /** Hide items restricted to other classes; null = show every class's items. */
  usableBy: WowClassId | null;
  /** Breaks ties: leveling favours items you can wear before 60, level60 the rest. */
  bracket: WeightBracket;
}
