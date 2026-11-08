import type { DownrankClassicFile } from "@/games/wow-forever/types/downrank/downrankClassicFile";
import type { DownrankFile } from "@/games/wow-forever/types/downrank/downrankFile";

/**
 * The calculator's generated data (`python -m scripts.wow_downrank.build`), each its own lazy chunk so
 * neither the main bundle nor any other WoW page carries it.
 */
export const DOWNRANK_SPELL_FILES = import.meta.glob<DownrankFile>("./spells.json", { import: "default" });

export const DOWNRANK_CLASSIC_FILES = import.meta.glob<DownrankClassicFile>("./classic/ranks.json", { import: "default" });
