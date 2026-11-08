import type { SpellbookChange } from "@/games/wow-forever/types/spellbook/spellbookChange";
import type { SpellbookRank } from "@/games/wow-forever/types/spellbook/spellbookRank";

/** One spell as the page shows it. */
export interface SpellbookSpell {
  id: number;
  name: string;
  tab: number;
  icon: number;
  /** Race ids when only some races learn it; empty = every race. */
  races: readonly number[];
  talent: number | null;
  downrank: string | null;
  change: SpellbookChange | null;
  /** The lowest learn level of any rank, Classic levels included; null when none is known. */
  firstLevel: number | null;
  ranks: readonly SpellbookRank[];
  /** Name, rank labels and tooltips, normalised once for the search box. */
  searchText: string;
}
