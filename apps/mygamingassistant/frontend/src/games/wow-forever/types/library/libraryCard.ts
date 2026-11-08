import type { ItemQuality } from "@/games/wow-forever/data/itemSlots";

/** A city's library card (an item new in Forever). */
export interface LibraryCard {
  id: number;
  name: string;
  city: string;
  quality: ItemQuality;
}
