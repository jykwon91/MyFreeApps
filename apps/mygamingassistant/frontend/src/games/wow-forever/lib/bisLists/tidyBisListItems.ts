import type { BisSlotId } from "@/games/wow-forever/data/bisLists/bisSlots";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { bisSlotsFor } from "@/games/wow-forever/lib/bisLists/bisSlotFit";
import { clashingSlots } from "@/games/wow-forever/lib/bisLists/placeBisItem";
import type { BisListItems } from "@/games/wow-forever/types/bisLists/bisListItems";

/**
 * Only the rows a class's list has, and never a two-hander alongside a
 * one-hand row: the two-hander wins (it comes first in character-sheet order).
 */
export function tidyBisListItems(items: BisListItems, classId: WowClassId): BisListItems {
  const kept: Partial<Record<BisSlotId, number>> = {};
  for (const { id: slot } of bisSlotsFor(classId)) {
    const itemId = items[slot];
    if (itemId === undefined || clashingSlots(slot).some((s) => kept[s] !== undefined)) continue;
    kept[slot] = itemId;
  }
  return kept;
}
