import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { MacroKind } from "@/games/wow-forever/types/macros/macroKind";
import type { MacroSyntax } from "@/games/wow-forever/types/macros/macroSyntax";

/** One ready-made macro to paste into the in-game macro window. */
export interface Macro {
  id: string;
  classId: WowClassId;
  kind: MacroKind;
  title: string;
  /** One line: what it does and why. */
  summary: string;
  /** The slash-command text, lines joined with "\n". */
  text: string;
  /** Spell and pet ability names the text casts. Checked against the client names for its class. */
  spells: readonly string[];
  /** Item names the text uses, rank words included ("Major Healthstone"). */
  items: readonly string[];
  /** Syntax in the text that is not confirmed to work in Forever. */
  unconfirmed: readonly MacroSyntax[];
}
