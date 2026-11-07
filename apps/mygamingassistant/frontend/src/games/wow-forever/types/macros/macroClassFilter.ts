import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { ALL_MACRO_CLASSES } from "@/games/wow-forever/data/macros/macroClassFilter";

/** The Macros page's class picker: one class, or every class. */
export type MacroClassFilter = WowClassId | typeof ALL_MACRO_CLASSES;
