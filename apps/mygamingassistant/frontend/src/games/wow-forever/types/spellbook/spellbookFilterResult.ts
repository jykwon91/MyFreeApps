import type { SpellbookSpell } from "@/games/wow-forever/types/spellbook/spellbookSpell";

/** The spells the filters keep, and the count each chip shows (that chip's choice with every other filter). */
export interface SpellbookFilterResult {
  spells: readonly SpellbookSpell[];
  /** Tab id -> spells in that tab. */
  tabCounts: ReadonlyMap<number, number>;
  allTabsCount: number;
  differentCount: number;
}
