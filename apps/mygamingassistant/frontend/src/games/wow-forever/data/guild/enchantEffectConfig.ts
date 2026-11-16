import type { StatKey } from "@/games/wow-forever/data/statKeys";

/** The five stats "+N to all stats" adds, and the ones a single-stat enchant can name. */
export const ENCHANT_PRIMARY_STATS: readonly StatKey[] = ["strength", "agility", "stamina", "intellect", "spirit"];

/** Regex group matching a spell school in an enchant tooltip. */
export const ENCHANT_SCHOOL_PATTERN = "(fire|frost|shadow|nature|arcane|holy)";

export const ENCHANT_SCHOOL_DAMAGE: Readonly<Record<string, StatKey>> = {
  fire: "fire_spell_damage",
  frost: "frost_spell_damage",
  shadow: "shadow_spell_damage",
  nature: "nature_spell_damage",
  arcane: "arcane_spell_damage",
  holy: "holy_spell_damage",
};

export const ENCHANT_SCHOOL_RESISTANCE: Readonly<Record<string, StatKey>> = {
  fire: "fire_resistance",
  frost: "frost_resistance",
  shadow: "shadow_resistance",
  nature: "nature_resistance",
  arcane: "arcane_resistance",
};

/** Procs, gathering skills, speed and damage against one creature type can't be weighed — left out. */
export const ENCHANT_UNSCORED =
  /often|chance|when you|speed|beasts|demons|elementals|giants|undead|fishing|herbalism|mining|skinning|riding|threat|stealth|subtlety/i;
