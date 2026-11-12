import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";
import type { CharacterCollections } from "@/games/wow-forever/types/character/characterCollections";
import type { CharacterDungeons } from "@/games/wow-forever/types/character/characterDungeons";
import type { CharacterProfessions } from "@/games/wow-forever/types/character/characterProfessions";
import type { CharacterPvp } from "@/games/wow-forever/types/character/characterPvp";
import type { CharacterReputation } from "@/games/wow-forever/types/character/characterReputation";
import type { CharacterStats } from "@/games/wow-forever/types/character/characterStats";
import type { CharacterTalents } from "@/games/wow-forever/types/character/characterTalents";

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
  /** The guild page's slug (/wow-forever/guild/:slug); null when guildless. */
  guild_slug: string | null;
  ruleset: string | null;
  equipped_item_level: number | null;
  /** ISO 8601. */
  last_login: string | null;
  has_render: boolean;
  items: CharacterItem[];
  /** Null until Blizzard has the character's numbers. */
  stats: CharacterStats | null;
  /** Null when Blizzard failed to send the talents; the rest of the sheet still shows. */
  talents: CharacterTalents | null;
  /** Null when Blizzard failed to send the professions; the rest of the sheet still shows. */
  professions: CharacterProfessions | null;
  /** Null when Blizzard failed to send the reputations; the rest of the sheet still shows. */
  reputations: CharacterReputation[] | null;
  /** Null when Blizzard failed to send the PvP summary; the rest of the sheet still shows. */
  pvp: CharacterPvp | null;
  /** Mounts and pets; each list null when Blizzard failed to send it. */
  collections: CharacterCollections;
  /** Null when Blizzard failed to send the statistics (the rest of the sheet still shows). */
  dungeons: CharacterDungeons | null;
}
