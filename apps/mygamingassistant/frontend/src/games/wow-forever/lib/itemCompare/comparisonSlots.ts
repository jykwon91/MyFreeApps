import { MAIN_HAND_SLOT, OFF_HAND_SLOT } from "@/games/wow-forever/data/character/characterConfig";
import { BLIZZARD_SLOT_FOR, PAIRED_BLIZZARD_SLOTS } from "@/games/wow-forever/data/itemCompare/blizzardSlots";
import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";

/** Whether an item in this slot is worn at all (reagents and the like are "other"). */
export function isEquippableSlot(slot: ItemSlot): boolean {
  return slot !== "other";
}

/**
 * The slots, by Blizzard's name, that an item is compared with, like the game's compare tooltip:
 * a ring or trinket with both of yours; a one-hander with the main hand, and the off hand when it
 * holds a weapon; a two-hander with the main hand and whatever is in the off hand; a shield or
 * held-in-off-hand item with the off hand; a ranged weapon, thrown weapon or relic with the ranged slot.
 */
export function comparisonSlots(slot: ItemSlot, equipped: ReadonlyMap<string, CharacterItem>): string[] {
  const paired = PAIRED_BLIZZARD_SLOTS[slot];
  if (paired) return [...paired];
  if (slot === "one_hand") {
    return equipped.get(OFF_HAND_SLOT)?.weapon ? [MAIN_HAND_SLOT, OFF_HAND_SLOT] : [MAIN_HAND_SLOT];
  }
  if (slot === "two_hand") return equipped.has(OFF_HAND_SLOT) ? [MAIN_HAND_SLOT, OFF_HAND_SLOT] : [MAIN_HAND_SLOT];
  const single = BLIZZARD_SLOT_FOR[slot];
  return single ? [single] : [];
}
