import type { ItemQuality, ItemSlot } from "@/games/wow-forever/data/itemSlots";
import type { ItemChangeKind } from "@/games/wow-forever/types/itemBrowser/itemChangeKind";
import type { ItemClassGroup } from "@/games/wow-forever/types/itemBrowser/itemClassGroup";

/** One item in the browser's index: only what the list shows, filters and sorts on. */
export interface ItemIndexEntry {
  id: number;
  name: string;
  quality: ItemQuality;
  slot: ItemSlot;
  /** "Sword", "Mail" …; null when the game prints none (rings, cloaks, neck, trinkets). */
  itemType: string | null;
  itemLevel: number;
  /** 0 = no level needed. */
  requiredLevel: number;
  change: ItemChangeKind;
  group: ItemClassGroup;
  /** The name's words, normalised for search (`normalizeItemName`). */
  searchWords: readonly string[];
}
