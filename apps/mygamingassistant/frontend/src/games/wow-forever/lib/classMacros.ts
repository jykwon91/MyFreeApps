import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { CLASS_MACROS } from "@/games/wow-forever/data/guide/classMacros";
import { fillMacroTemplate, findMacroTemplate } from "@/games/wow-forever/lib/macroTemplates";
import type { ClassMacro } from "@/games/wow-forever/types/classMacro";
import type { ClassMacroGroup } from "@/games/wow-forever/types/classMacroGroup";

/** A ready-made macro's paste-in text. */
export function classMacroText(macro: ClassMacro): string {
  return fillMacroTemplate(findMacroTemplate(macro.template), macro.spell);
}

/** The ready-made macros by class, in the class list's order; classes with none are left out. */
export function classMacroGroups(macros: readonly ClassMacro[] = CLASS_MACROS): ClassMacroGroup[] {
  return WOW_CLASSES.map((wowClass) => ({ wowClass, macros: macros.filter((m) => m.classId === wowClass.id) })).filter(
    (group) => group.macros.length > 0,
  );
}
