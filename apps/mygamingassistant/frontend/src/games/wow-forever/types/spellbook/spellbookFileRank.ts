/** One rank as `data/spellbook/<class>.json` stores it (empty fields left out). */
export interface SpellbookFileRank {
  spell: number;
  /** "Rank 3", or the client's other subtext ("Summon", "Shapeshift"); absent when the spell has none. */
  rank?: string;
  /** The Forever client's learn level. */
  level?: number;
  /** The Forever tooltip with its numbers filled in. */
  text?: string;
  /** The rank a talent point grants (no trainer cost). */
  talent?: true;
  passive?: true;
  /** The Changes vs Classic feed lists this rank as changed. */
  changed?: true;
}
