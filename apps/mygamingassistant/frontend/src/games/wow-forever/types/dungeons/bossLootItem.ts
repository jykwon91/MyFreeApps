import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";

/** One item a dungeon boss drops: the Forever client's item, with the Classic chance per kill. */
export interface BossLootItem {
  id: number;
  name: string;
  slot: ItemSlot | null;
  /** "Sword", "Leather"; null for rings, cloaks, trinkets. */
  itemType: string | null;
  /** Percent per kill (Classic loot rules). */
  chance: number;
}
