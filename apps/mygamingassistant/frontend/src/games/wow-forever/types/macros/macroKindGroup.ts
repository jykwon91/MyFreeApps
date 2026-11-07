import type { Macro } from "@/games/wow-forever/types/macros/macro";
import type { MacroKind } from "@/games/wow-forever/types/macros/macroKind";

/** One kind of macro within a class's list ("Hover cast", "Pet", ...). */
export interface MacroKindGroup {
  kind: MacroKind;
  macros: readonly Macro[];
}
