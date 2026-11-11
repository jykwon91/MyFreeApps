import type { SpellbookLearnedBy } from "@/games/wow-forever/types/spellbook/spellbookLearnedBy";

/** One spell rank you can learn at a level. */
export interface LevelUnlock {
  spell: number;
  name: string;
  /** The spell's icon file id (0 = none). */
  icon: number;
  /** "Rank 3", or "" when the spell has no rank. */
  rank: string;
  learnedBy: SpellbookLearnedBy;
  /** Race names when only some races learn it; empty = every race. */
  races: readonly string[];
  /** The level is Classic's: Forever's files don't give one. */
  levelClassic: boolean;
  /** The demon that learns it (Warlock), or null for the class's own spells. */
  demon: string | null;
  /** The demon has it when summoned — no Grimoire to buy. */
  knownOnSummon: boolean;
  /** A Grimoire in the Forever files teaches this demon rank. */
  grimoire: boolean;
}
