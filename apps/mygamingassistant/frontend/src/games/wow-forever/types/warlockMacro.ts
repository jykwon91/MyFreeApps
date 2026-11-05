import type { WarlockMacroSyntax } from "@/games/wow-forever/types/warlockMacroSyntax";

/** One macro to paste into the in-game macro window. */
export interface WarlockMacro {
  id: string;
  title: string;
  /** One line: what it does and why. */
  summary: string;
  /** The slash-command text, lines joined with "\n". */
  text: string;
  /** Spell and pet ability names the text casts. Checked against the client names. */
  spells: readonly string[];
  /** Item names the text uses, rank words included ("Major Healthstone"). */
  items: readonly string[];
  /** Syntax in the text that is not confirmed to work in Forever. */
  unconfirmed: readonly WarlockMacroSyntax[];
}
