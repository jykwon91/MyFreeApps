import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { ItemQuality, ItemSlot } from "@/games/wow-forever/data/itemSlots";
import type { StatValues } from "@/games/wow-forever/data/statKeys";
import type { WeaponStats } from "@/games/wow-forever/types/compareItem";

/** One item from the Forever client's item tables (`data/items/items.json`). */
export interface ClientItem {
  id: number;
  name: string;
  quality: ItemQuality;
  slot: ItemSlot;
  /** "Cloth", "Sword", "Shield"…; null when the tooltip names no type (cloaks, rings). */
  itemType: string | null;
  itemLevel: number;
  /** 0 = no level requirement. */
  requiredLevel: number;
  armor: number | null;
  weapon: WeaponStats | null;
  stats: StatValues;
  /** Classes the item is restricted to; null = every class. Says nothing about proficiency. */
  classes: readonly WowClassId[] | null;
  /** A weapon whose damage the game files don't give (caster weapons, legendaries). */
  damageUnknown: boolean;
  /** Stats the item has that the compare page has no key for (counted, not shown). */
  otherEffects: number;
  /** Stats come from a random "of the …" suffix, so they aren't in the item list. */
  randomSuffix: boolean;
}
