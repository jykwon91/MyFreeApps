import type { SpellbookChange } from "@/games/wow-forever/types/spellbook/spellbookChange";
import type { SpellbookFileRank } from "@/games/wow-forever/types/spellbook/spellbookFileRank";

/** One spell (a class + name) as `data/spellbook/<class>.json` stores it. */
export interface SpellbookFileSpell {
  /** The first rank's spell id — the card's anchor (`#spell-<id>`). */
  id: number;
  name: string;
  /** The spell tab's skill line id. */
  tab: number;
  /** Icon file id (0 = none). */
  icon: number;
  /** Race ids (ChrRaces) when only some races learn it. */
  races?: number[];
  /** The talent that grants it. */
  talent?: number;
  /** The downrank calculator's family id. */
  downrank?: string;
  changed?: SpellbookChange;
  ranks: SpellbookFileRank[];
}
