import type { WowClass } from "@/games/wow-forever/data/classes";
import type { ClassMacro } from "@/games/wow-forever/types/classMacro";

/** One class's ready-made macros, as the Guide lists them. */
export interface ClassMacroGroup {
  wowClass: WowClass;
  macros: readonly ClassMacro[];
}
