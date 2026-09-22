import type { ItemQuality, ItemSlot } from "@/games/wow-forever/data/itemSlots";

/** Wire shape of POST /wow/items/extract (backend `ItemExtractionResponse`). */
export interface ExtractedWeaponResponse {
  min_damage: number;
  max_damage: number;
  speed: number;
  dps: number;
}

export interface ExtractedItemResponse {
  name: string;
  quality: ItemQuality | null;
  slot: ItemSlot | null;
  item_type: string | null;
  armor: number | null;
  weapon: ExtractedWeaponResponse | null;
  /** Keys are backend `StatKey`s; unknown keys are filtered on the way in. */
  stats: Record<string, number>;
  unparsed_effects: string[];
  required_level: number | null;
  set_name: string | null;
}

export interface ItemExtractionResponse {
  item: ExtractedItemResponse;
  warnings: string[];
}
