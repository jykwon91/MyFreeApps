import { isItemQuality, type ItemQuality } from "@/games/wow-forever/data/itemSlots";

/** Blizzard's quality name as MGA's quality key; anything unknown reads as common. */
export function characterItemQuality(quality: string): ItemQuality {
  return isItemQuality(quality) ? quality : "common";
}
