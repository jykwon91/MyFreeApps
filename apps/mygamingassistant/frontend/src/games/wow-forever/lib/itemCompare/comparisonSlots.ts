import { MAIN_HAND_SLOT, OFF_HAND_SLOT } from "@/games/wow-forever/data/character/characterConfig";
import { BLIZZARD_SLOT_FOR, PAIRED_BLIZZARD_SLOTS } from "@/games/wow-forever/data/itemCompare/blizzardSlots";
import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import { slotContent } from "@/games/wow-forever/lib/character/characterGear";
import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";
import type { ComparisonSlot } from "@/games/wow-forever/types/itemCompare/comparisonSlot";

/** Whether an item in this slot is worn at all (reagents and the like are "other"). */
export function isEquippableSlot(slot: ItemSlot): boolean {
  return slot !== "other";
}

function plain(slot: string): ComparisonSlot {
  return { slot, replacesTwoHander: false };
}

/**
 * The slots an item is compared with, like the game's compare tooltip: a ring or trinket with both of
 * yours; a one-hander with the main hand, and the off hand when it holds a weapon; a two-hander with the
 * main hand and whatever is in the off hand; a shield or held-in-off-hand item with the off hand, or,
 * when a two-hander fills both hands, with that two-hander (marked as replaced); a ranged weapon,
 * thrown weapon or relic with the ranged slot.
 */
export function comparisonSlots(slot: ItemSlot, equipped: ReadonlyMap<string, CharacterItem>): ComparisonSlot[] {
  const paired = PAIRED_BLIZZARD_SLOTS[slot];
  if (paired) return paired.map(plain);
  if (slot === "one_hand") {
    return [plain(MAIN_HAND_SLOT), ...(equipped.get(OFF_HAND_SLOT)?.weapon ? [plain(OFF_HAND_SLOT)] : [])];
  }
  if (slot === "two_hand") return [plain(MAIN_HAND_SLOT), ...(equipped.has(OFF_HAND_SLOT) ? [plain(OFF_HAND_SLOT)] : [])];
  const single = BLIZZARD_SLOT_FOR[slot];
  if (single === OFF_HAND_SLOT && slotContent(OFF_HAND_SLOT, equipped).kind === "two_hand") {
    return [{ slot: MAIN_HAND_SLOT, replacesTwoHander: true }];
  }
  return single ? [plain(single)] : [];
}
