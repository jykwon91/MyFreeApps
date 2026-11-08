import type { ItemQuality, ItemSlot } from "@/games/wow-forever/data/itemSlots";

/** An item a library reward quest gives. */
export interface LibraryRewardItem {
  id: number;
  name: string;
  quality: ItemQuality;
  slot: ItemSlot | null;
  count: number;
}
