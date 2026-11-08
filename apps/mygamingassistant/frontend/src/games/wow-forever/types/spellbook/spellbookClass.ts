import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { SpellbookSpell } from "@/games/wow-forever/types/spellbook/spellbookSpell";
import type { SpellbookTab } from "@/games/wow-forever/types/spellbook/spellbookTab";

/** One class's spellbook, decoded. */
export interface SpellbookClass {
  classId: WowClassId;
  clientBuild: string;
  tabs: readonly SpellbookTab[];
  spells: readonly SpellbookSpell[];
}
