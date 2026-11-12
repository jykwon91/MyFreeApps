import {
  MAIN_HAND_SLOT,
  OFF_HAND_SLOT,
  OPTIONAL_SLOTS,
  TWO_HAND_INVENTORY_TYPE,
} from "@/games/wow-forever/data/character/characterConfig";
import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";
import type { PaperDollSlot } from "@/games/wow-forever/types/character/paperDollSlot";
import type { SlotContent } from "@/games/wow-forever/types/character/slotContent";

export function itemsBySlot(items: readonly CharacterItem[]): ReadonlyMap<string, CharacterItem> {
  return new Map(items.map((item) => [item.slot, item]));
}

export function slotContent(slot: string, bySlot: ReadonlyMap<string, CharacterItem>): SlotContent {
  const item = bySlot.get(slot);
  if (item) return { kind: "item", item };
  if (slot === OFF_HAND_SLOT && bySlot.get(MAIN_HAND_SLOT)?.inventory_type === TWO_HAND_INVENTORY_TYPE) {
    return { kind: "two_hand" };
  }
  return { kind: "empty" };
}

/** The sockets to draw: every slot, except an optional one with nothing in it. */
export function visibleSlots(slots: readonly PaperDollSlot[], bySlot: ReadonlyMap<string, CharacterItem>): PaperDollSlot[] {
  return slots.filter((s) => !OPTIONAL_SLOTS.has(s.slot) || bySlot.has(s.slot));
}
