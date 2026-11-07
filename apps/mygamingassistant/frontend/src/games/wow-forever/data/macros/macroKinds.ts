import type { MacroKind } from "@/games/wow-forever/types/macros/macroKind";

/** The order a class's macros are listed in: hover cast always first. */
export const MACRO_KIND_ORDER: readonly MacroKind[] = ["hover", "damage", "pet", "focus", "emergency", "stones", "utility"];

export const MACRO_KIND_LABELS: Readonly<Record<MacroKind, string>> = {
  hover: "Hover cast",
  damage: "Damage and curses",
  pet: "Pet",
  focus: "Focus target",
  emergency: "Emergency",
  stones: "Healthstones, Soulstones and potions",
  utility: "Utility",
};
