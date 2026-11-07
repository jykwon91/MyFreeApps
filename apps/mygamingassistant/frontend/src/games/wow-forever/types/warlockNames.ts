/** The generated Warlock names from the Forever client (`data/warlock/warlockNames.json`). */
export interface WarlockNames {
  source: string;
  clientBuild: string;
  spells: readonly string[];
  petSpells: readonly string[];
  /** Spells every class has that the macros use ("Shoot", the wand). */
  generalSpells: readonly string[];
  items: readonly string[];
  /** Healing potion item names, "Minor Healing Potion" to "Major Healing Potion". */
  potions: readonly string[];
}
