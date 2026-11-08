import type { ItemQuality, ItemSlot } from "@/games/wow-forever/data/itemSlots";
import type { ItemChangeMark } from "@/games/wow-forever/types/itemBrowser/itemChangeMark";
import type { ItemClassGroup } from "@/games/wow-forever/types/itemBrowser/itemClassGroup";

/** What the item browser narrows the list by. Empty lists and nulls mean "no filter". */
export interface ItemBrowserFilters {
  query: string;
  qualities: readonly ItemQuality[];
  groups: readonly ItemClassGroup[];
  slots: readonly ItemSlot[];
  types: readonly string[];
  changes: readonly ItemChangeMark[];
  requiredMin: number | null;
  requiredMax: number | null;
  itemLevelMin: number | null;
  itemLevelMax: number | null;
}
