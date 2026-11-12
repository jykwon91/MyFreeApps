import type { CharacterItemStat } from "@/games/wow-forever/types/character/characterItemStat";
import type { CharacterItemWeapon } from "@/games/wow-forever/types/character/characterItemWeapon";

/** An item the character wears, with the stats it actually rolled (`GET /wow/characters/{slug}`). */
export interface CharacterItem {
  /** Blizzard's slot: HEAD, NECK, FINGER_1, MAIN_HAND, RANGED, AMMO… */
  slot: string;
  item_id: number;
  name: string;
  /** poor / common / uncommon / rare / epic / legendary / artifact / heirloom */
  quality: string;
  item_level: number;
  /** Blizzard's inventory type: HEAD, TWOHWEAPON, WEAPONMAINHAND… */
  inventory_type: string;
  inventory_type_name: string;
  subclass_name: string | null;
  binding: string | null;
  armor: string | null;
  weapon: CharacterItemWeapon | null;
  stats: CharacterItemStat[];
  enchantments: string[];
  /** "Use: …" / "Equip: …" lines. */
  spells: string[];
  set_name: string | null;
  requirements: string[];
  durability: string | null;
  durability_low: boolean;
  description: string | null;
}
