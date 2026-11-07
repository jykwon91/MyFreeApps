import type { WowClassId } from "@/games/wow-forever/data/classes";

/** The generated names from the Forever client (`data/macros/macroNames.json`) every macro is checked against. */
export interface MacroNames {
  source: string;
  clientBuild: string;
  /** Per class: its trainer spells plus its pets' abilities. */
  classes: Readonly<Record<WowClassId, readonly string[]>>;
  /** Spells every class has that the macros use ("Shoot", the wand). */
  generalSpells: readonly string[];
  /** Healthstone, Soulstone and Healing Potion names, every rank. */
  items: readonly string[];
}
