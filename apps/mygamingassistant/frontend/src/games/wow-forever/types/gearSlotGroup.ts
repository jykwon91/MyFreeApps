import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";

/** A card on the Best gear page: one equipment slot (or a weapon choice) and the item slots that fill it. */
export interface GearSlotGroup {
  id: string;
  label: string;
  slots: readonly ItemSlot[];
  /** "Wear two" (rings, trinkets) or the weapon either-or. */
  note: string | null;
}
