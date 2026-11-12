import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { CharacterStatsTab } from "@/games/wow-forever/types/character/characterStatsTab";

/** The stats tab this browser last picked. */
export const CHARACTER_STATS_TAB_STORAGE_KEY = "mga.wowForever.character.statsTab.v1";

export const CHARACTER_STATS_TABS: readonly CharacterStatsTab[] = ["melee", "ranged", "spell", "defenses"];

export const CHARACTER_STATS_TAB_LABELS: Readonly<Record<CharacterStatsTab, string>> = {
  melee: "Melee",
  ranged: "Ranged",
  spell: "Spell",
  defenses: "Defenses",
};

/** The tab a class looks at first; every other class starts on Melee. */
export const CHARACTER_STATS_CLASS_TAB: Readonly<Partial<Record<WowClassId, CharacterStatsTab>>> = {
  mage: "spell",
  priest: "spell",
  warlock: "spell",
  hunter: "ranged",
};

export const CHARACTER_STATS_DEFAULT_TAB: CharacterStatsTab = "melee";

/** Run speed with no speed bonus, as Blizzard reports it. */
export const NORMAL_MOVEMENT_SPEED = 100;

/** The resistances in the game pane's order. */
export const RESISTANCE_LABELS = [
  ["arcane", "Arcane"],
  ["fire", "Fire"],
  ["frost", "Frost"],
  ["nature", "Nature"],
  ["shadow", "Shadow"],
] as const;
