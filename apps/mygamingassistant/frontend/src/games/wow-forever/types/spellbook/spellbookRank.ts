import type { SpellbookLearnedBy } from "@/games/wow-forever/types/spellbook/spellbookLearnedBy";

/** One rank with its Classic fallbacks merged in; each `…Classic` flag says the value is Classic data. */
export interface SpellbookRank {
  spell: number;
  /** "Rank 3", "Summon", or "" when the spell has no subtext. */
  label: string;
  level: number | null;
  levelClassic: boolean;
  text: string | null;
  textClassic: boolean;
  learnedBy: SpellbookLearnedBy;
  /** Copper, when a Classic trainer teaches it. */
  cost: number | null;
  passive: boolean;
  changed: boolean;
}
