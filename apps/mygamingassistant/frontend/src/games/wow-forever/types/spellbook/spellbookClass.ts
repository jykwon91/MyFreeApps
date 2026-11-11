import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { SpellbookDemon } from "@/games/wow-forever/types/spellbook/spellbookDemon";
import type { SpellbookSpell } from "@/games/wow-forever/types/spellbook/spellbookSpell";
import type { SpellbookTab } from "@/games/wow-forever/types/spellbook/spellbookTab";

/** One class's spellbook, decoded. */
export interface SpellbookClass {
  classId: WowClassId;
  clientBuild: string;
  tabs: readonly SpellbookTab[];
  spells: readonly SpellbookSpell[];
  /** The Warlock's demons; empty for every other class. */
  demons: readonly SpellbookDemon[];
}
