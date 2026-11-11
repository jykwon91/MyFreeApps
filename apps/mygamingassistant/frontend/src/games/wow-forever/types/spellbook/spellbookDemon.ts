import type { SpellbookDemonAbility } from "@/games/wow-forever/types/spellbook/spellbookDemonAbility";

/** A Warlock demon (its "Pet - Imp" skill line) and what it learns. */
export interface SpellbookDemon {
  /** The skill line id. */
  line: number;
  name: string;
  abilities: SpellbookDemonAbility[];
}
