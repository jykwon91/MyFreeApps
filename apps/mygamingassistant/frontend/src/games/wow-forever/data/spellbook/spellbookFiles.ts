import type { SpellbookClassicFile } from "@/games/wow-forever/types/spellbook/spellbookClassicFile";
import type { SpellbookFile } from "@/games/wow-forever/types/spellbook/spellbookFile";

/**
 * Each class's spellbook (`python -m scripts.wow_spellbook.build`), its own lazy chunk: the page loads one
 * class's Forever file and its Classic fill-ins, never all nine.
 */
export const FOREVER_SPELLBOOK_FILES = import.meta.glob<SpellbookFile>("./[a-z]*.json", { import: "default" });

export const CLASSIC_SPELLBOOK_FILES = import.meta.glob<SpellbookClassicFile>("./classic/[a-z]*.json", { import: "default" });
