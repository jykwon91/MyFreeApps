import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { MacroTemplateId } from "@/games/wow-forever/types/macros/macroTemplateId";

/** A ready-made hover-cast macro: one of the templates, filled with one class spell. */
export interface HoverCastMacro {
  id: string;
  classId: WowClassId;
  template: MacroTemplateId;
  /** Exact in-game name, no rank. A test checks it against the class's spells in the Forever client. */
  spell: string;
  /** One line: what it does for you. */
  summary: string;
}
