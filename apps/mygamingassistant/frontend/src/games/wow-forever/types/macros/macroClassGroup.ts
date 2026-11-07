import type { WowClass } from "@/games/wow-forever/data/classes";
import type { MacroKindGroup } from "@/games/wow-forever/types/macros/macroKindGroup";

/** One class's ready-made macros, by kind, as the Macros page lists them. */
export interface MacroClassGroup {
  wowClass: WowClass;
  kinds: readonly MacroKindGroup[];
}
