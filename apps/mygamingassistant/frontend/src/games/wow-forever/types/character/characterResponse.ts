import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";
import type { CharacterStats } from "@/games/wow-forever/types/character/characterStats";

/** A WoW Forever character as Blizzard saw it at their last log out (`GET /wow/characters/{slug}`). */
export interface CharacterResponse {
  slug: string;
  name: string;
  surname: string;
  level: number;
  race: string;
  class_id: number;
  class_name: string;
  gender: string;
  /** alliance / horde */
  faction: string;
  guild: string | null;
  ruleset: string | null;
  equipped_item_level: number | null;
  /** ISO 8601. */
  last_login: string | null;
  has_render: boolean;
  items: CharacterItem[];
  /** Null until Blizzard has the character's numbers. */
  stats: CharacterStats | null;
}
