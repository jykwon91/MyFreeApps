import type { MacroSyntax } from "@/games/wow-forever/types/macros/macroSyntax";

/** One macro on the card: what the Macros page's own card shows. */
export interface AskMacroRow {
  id: string;
  title: string;
  summary: string;
  text: string;
  /** Syntax in the text not confirmed to work in Forever. */
  unconfirmed: readonly MacroSyntax[];
}
