/** One rank of a demon's ability (`demons` in `data/spellbook/warlock.json`). */
export interface SpellbookDemonRank {
  spell: number;
  /** The Warlock level its Grimoire asks for (Forever's files). */
  level: number;
  /** "Rank 2"; absent when the ability has one rank. */
  rank?: string;
  /** The Forever tooltip with its numbers filled in. */
  text?: string;
  /** The demon has it as soon as it's summoned. */
  known?: true;
  /** The Grimoire item that teaches it, sold by Demon trainers. */
  grimoire?: number;
}
