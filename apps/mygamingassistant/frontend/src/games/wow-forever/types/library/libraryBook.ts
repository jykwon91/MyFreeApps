import type { ItemQuality } from "@/games/wow-forever/data/itemSlots";

/** A collectible library book, as the Forever client's item data describes it. */
export interface LibraryBook {
  id: number;
  name: string;
  description: string;
  itemLevel: number;
  quality: ItemQuality;
}
