import type { ItemQuality, ItemSlot } from "@/games/wow-forever/data/itemSlots";
import type { ItemClassGroup } from "@/games/wow-forever/types/itemBrowser/itemClassGroup";
import type { ItemIndexEntry } from "@/games/wow-forever/types/itemBrowser/itemIndexEntry";

/** The decoded index: every item, sorted by id, and the chip options that have at least one item. */
export interface ItemIndex {
  clientBuild: string;
  items: readonly ItemIndexEntry[];
  /** In the game's order (Uncommon → Legendary). */
  qualities: readonly ItemQuality[];
  /** In `ITEM_CLASS_GROUPS` order. */
  groups: readonly ItemClassGroup[];
  /** In `ITEM_SLOTS` order (head to feet, then jewelry and weapons). */
  slots: readonly ItemSlot[];
  /** Armor types first (Cloth, Leather, Mail, Plate, Shield), then weapon types A–Z. */
  itemTypes: readonly string[];
}
