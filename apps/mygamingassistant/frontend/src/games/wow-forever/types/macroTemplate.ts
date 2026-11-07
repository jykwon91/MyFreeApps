import type { MacroTemplateId } from "@/games/wow-forever/types/macroTemplateId";

/** A mouseover macro that works for any class: the player fills in their own spell. */
export interface MacroTemplate {
  id: MacroTemplateId;
  title: string;
  /** Plain English: the kinds of spell it suits. */
  useFor: string;
  /** The targeting brackets that go between `/cast` and the spell name. */
  conditions: string;
}
