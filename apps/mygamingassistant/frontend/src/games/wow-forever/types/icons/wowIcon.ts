import type { ItemQuality } from "@/games/wow-forever/data/itemSlots";

/** One icon to draw: the client's icon file, and the item's quality for the frame colour (spells have none). */
export interface WowIcon {
  fileDataId: number;
  quality: ItemQuality | null;
}
