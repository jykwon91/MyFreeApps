import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { SpellbookFileSpell } from "@/games/wow-forever/types/spellbook/spellbookFileSpell";
import type { SpellbookTab } from "@/games/wow-forever/types/spellbook/spellbookTab";

/** `data/spellbook/<class>.json` — generated from the Forever client by `scripts.wow_spellbook.build`. */
export interface SpellbookFile {
  source: string;
  clientBuild: string;
  classId: WowClassId;
  tabs: SpellbookTab[];
  spells: SpellbookFileSpell[];
}
