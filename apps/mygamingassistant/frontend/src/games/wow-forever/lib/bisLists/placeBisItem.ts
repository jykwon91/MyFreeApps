import { ONE_HAND_SLOTS, TWO_HAND_SLOT, type BisSlotId } from "@/games/wow-forever/data/bisLists/bisSlots";
import type { BisListItems } from "@/games/wow-forever/types/bisLists/bisListItems";
import type { PlacedBisItem } from "@/games/wow-forever/types/bisLists/placedBisItem";

/** Rows a pick in `slot` empties: a two-hander takes both hands, and either hand frees the two-hander. */
export function clashingSlots(slot: BisSlotId): readonly BisSlotId[] {
  if (slot === TWO_HAND_SLOT) return ONE_HAND_SLOTS;
  if (ONE_HAND_SLOTS.includes(slot)) return [TWO_HAND_SLOT];
  return [];
}

/** Put an item in a row (null empties it), emptying the rows it clashes with. Returns the rows that changed besides `slot`. */
export function placeBisItem(
  items: BisListItems,
  slot: BisSlotId,
  itemId: number | null,
): PlacedBisItem {
  const next: Partial<Record<BisSlotId, number>> = { ...items };
  const cleared: BisSlotId[] = [];
  if (itemId === null) {
    delete next[slot];
    return { items: next, cleared };
  }
  next[slot] = itemId;
  for (const other of clashingSlots(slot)) {
    if (next[other] !== undefined) {
      delete next[other];
      cleared.push(other);
    }
  }
  return { items: next, cleared };
}
