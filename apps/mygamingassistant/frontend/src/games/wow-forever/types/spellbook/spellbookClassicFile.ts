import type { WowClassId } from "@/games/wow-forever/data/classes";

/** `data/spellbook/classic/<class>.json` — what only Classic data has, keyed by spell id. */
export interface SpellbookClassicFile {
  source: string;
  classId: WowClassId;
  /** Spell id -> the Classic trainer's cost in copper. */
  costs: Record<string, number>;
  quests: number[];
  books: number[];
  /** Spell id -> Classic's tooltip, for ranks whose Forever tooltip can't be read in full. */
  texts: Record<string, string>;
  /** Spell id -> Classic's learn level, for ranks with no Forever level. */
  levels: Record<string, number>;
}
