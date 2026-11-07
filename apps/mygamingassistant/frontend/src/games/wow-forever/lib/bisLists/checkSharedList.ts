import type { BisSlotId } from "@/games/wow-forever/data/bisLists/bisSlots";
import { fitsBisSlot } from "@/games/wow-forever/lib/bisLists/bisSlotFit";
import { tidyBisListItems } from "@/games/wow-forever/lib/bisLists/tidyBisListItems";
import type { DecodedSharedList } from "@/games/wow-forever/types/bisLists/decodedSharedList";
import type { SharedBisList } from "@/games/wow-forever/types/bisLists/sharedBisList";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

/**
 * A decoded link checked against the item list: rows naming an item that
 * isn't in it, or one the class can't wear in that row, are left out. If the
 * link fills both a two-hander and a one-hand row, the two-hander wins.
 */
export function checkSharedList(list: SharedBisList, byId: ReadonlyMap<number, ClientItem>): DecodedSharedList {
  const wearable: Partial<Record<BisSlotId, number>> = {};
  for (const [slot, itemId] of Object.entries(list.items) as [BisSlotId, number][]) {
    const item = byId.get(itemId);
    if (item && fitsBisSlot(item, slot, list.classId)) wearable[slot] = itemId;
  }
  const items = tidyBisListItems(wearable, list.classId);
  return { list: { ...list, items }, dropped: Object.keys(list.items).length - Object.keys(items).length };
}
