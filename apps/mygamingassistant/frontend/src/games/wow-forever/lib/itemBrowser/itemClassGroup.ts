import { SHIELD_TYPE, SLOT_CLASS_GROUP } from "@/games/wow-forever/data/itemBrowser/itemBrowserConfig";
import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import { ITEM_CLASS_GROUP, type ItemClassGroup } from "@/games/wow-forever/types/itemBrowser/itemClassGroup";

/** The item-class group a slot + type belongs to; a shield is a shield, not a weapon. */
export function itemClassGroup(slot: ItemSlot, itemType: string | null): ItemClassGroup {
  if (itemType === SHIELD_TYPE) return ITEM_CLASS_GROUP.offHand;
  return SLOT_CLASS_GROUP[slot];
}
