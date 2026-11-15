/** Where one kind of enchant can go: which Blizzard slots, and which item types in them. */
export interface EnchantSlotTarget {
  /** CharacterItem.slot values that could match. */
  blizzardSlots: readonly string[];
  /** When set, the item's inventory_type must equal this (shields only "SHIELD"; 2H only "TWOHWEAPON"). */
  inventoryTypeIs: string | null;
  /** inventory_types the enchant can't go on (a one-hand enchant on a shield, two-hander or tome). */
  inventoryTypesNot: readonly string[];
}
