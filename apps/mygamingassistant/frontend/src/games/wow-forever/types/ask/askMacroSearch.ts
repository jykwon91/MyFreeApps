import type { Macro } from "@/games/wow-forever/types/macros/macro";

/** `searchMacros`: the macros found, best first. */
export interface AskMacroSearch {
  macros: Macro[];
  /** False when the search words matched nothing and these are the class's macros. */
  matched: boolean;
}
