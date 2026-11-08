import type { ClassicTalentFile } from "@/games/wow-forever/types/talents/classicTalentFile";
import type { TalentFile } from "@/games/wow-forever/types/talents/talentFile";

/**
 * Each class's talent data, its own lazy chunk: the calculator loads one
 * class's Forever file and its Classic comparison, never all nine. Globbed so
 * neither the main bundle nor the type checker carries them.
 */
export const FOREVER_TALENT_FILES = import.meta.glob<TalentFile>("./[a-z]*.json", { import: "default" });

export const CLASSIC_TALENT_FILES = import.meta.glob<ClassicTalentFile>("./classic/[a-z]*.json", { import: "default" });
