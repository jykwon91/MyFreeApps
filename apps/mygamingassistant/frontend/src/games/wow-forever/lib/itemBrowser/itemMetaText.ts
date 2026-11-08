import { SLOT_LABELS } from "@/games/wow-forever/data/itemSlots";
import type { ItemIndexEntry } from "@/games/wow-forever/types/itemBrowser/itemIndexEntry";

/** "Head, Plate" (or just the slot when the game prints no type). */
export function itemSlotText(item: ItemIndexEntry): string {
  return item.itemType ? `${SLOT_LABELS[item.slot]}, ${item.itemType}` : SLOT_LABELS[item.slot];
}

/** "Item level 58 · Requires level 52" — the requirement left out when there's none. */
export function itemLevelText(item: ItemIndexEntry): string {
  const parts = [`Item level ${item.itemLevel}`];
  if (item.requiredLevel > 0) parts.push(`Requires level ${item.requiredLevel}`);
  return parts.join(" · ");
}
