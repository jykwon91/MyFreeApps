import type { SpellbookDemonRank } from "@/games/wow-forever/types/spellbook/spellbookDemonRank";

/** One of a demon's abilities, ranks lowest level first. */
export interface SpellbookDemonAbility {
  name: string;
  /** Icon file id (0 = none). */
  icon: number;
  ranks: SpellbookDemonRank[];
}
