import type { WowClassId } from "@/games/wow-forever/data/classes";
import { CLASS_PROFICIENCIES } from "@/games/wow-forever/data/gear/classProficiencies";
import { GEAR_SLOT_GROUPS } from "@/games/wow-forever/data/gear/gearSlotGroups";
import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { GearSlotGroup } from "@/games/wow-forever/types/gearSlotGroup";
import type { GearSource } from "@/games/wow-forever/types/gearSource";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

const ARMOR_SLOTS: ReadonlySet<ItemSlot> = new Set([
  "head", "shoulder", "chest", "wrist", "hands", "waist", "legs", "feet",
]);

function armorAllowed(item: ClientItem, classId: WowClassId, level: number): boolean {
  const prof = CLASS_PROFICIENCIES[classId];
  if (item.itemType === null || prof.armor.includes(item.itemType)) return true;
  return prof.heavyArmor !== null && prof.heavyArmor.type === item.itemType && level >= prof.heavyArmor.level;
}

/** Can the class wear this item in this slot card's position at this level? (Classic proficiencies.) */
export function canEquip(item: ClientItem, group: GearSlotGroup, classId: WowClassId, level: number): boolean {
  if (item.classes !== null && !item.classes.includes(classId)) return false;
  if (!group.slots.includes(item.slot)) return false;
  const prof = CLASS_PROFICIENCIES[classId];
  const type = item.itemType;
  if (ARMOR_SLOTS.has(item.slot)) return armorAllowed(item, classId, level);
  switch (item.slot) {
    case "two_hand":
      return type !== null && prof.twoHand.includes(type);
    case "main_hand":
      return type !== null && prof.oneHand.includes(type);
    case "one_hand":
      if (type === null || !prof.oneHand.includes(type)) return false;
      if (group.id !== "off_hand") return true;
      return prof.dualWieldLevel !== null && level >= prof.dualWieldLevel;
    case "off_hand":
      if (type === "Shield") return prof.shield;
      if (type === null || !prof.oneHand.includes(type)) return false;
      return prof.dualWieldLevel !== null && level >= prof.dualWieldLevel;
    case "ranged":
    case "thrown":
      return type !== null && prof.ranged.includes(type);
    case "relic":
      return false;
    default:
      // Neck, back, rings, trinkets, held in off hand: anyone.
      return true;
  }
}

/**
 * Can the class wear this item anywhere at this level? Only a known "no" counts: an item whose
 * type the game files don't give, or in a slot no slot card covers (relics, shirts, tabards), only
 * fails when the item names other classes.
 */
export function canWear(item: ClientItem, classId: WowClassId, level: number): boolean {
  const carded = item.slot !== "relic" && GEAR_SLOT_GROUPS.some((group) => group.slots.includes(item.slot));
  if (item.itemType === null || !carded) return item.classes === null || item.classes.includes(classId);
  return GEAR_SLOT_GROUPS.some((group) => canEquip(item, group, classId, level));
}

/** Does the class ever fill this card? (No two-hander for a Rogue, no ranged slot for a Paladin.) */
export function groupUsable(group: GearSlotGroup, classId: WowClassId): boolean {
  const prof = CLASS_PROFICIENCIES[classId];
  if (group.id === "two_hand") return prof.twoHand.length > 0;
  if (group.id === "ranged") return prof.ranged.length > 0;
  return true;
}

/** A quest the player can do: their faction (or both) and, for class quests, their class. */
export function questOpenTo(source: GearSource, classId: WowClassId, faction: PlayerFaction): boolean {
  if (source.kind !== "quest") return true;
  if (source.side !== FACTION.neutral && source.side !== faction) return false;
  return source.classes.length === 0 || source.classes.includes(classId);
}
