import { findClass, WOW_CLASSES, type WowClass } from "@/games/wow-forever/data/classes";
import { ALL_MACRO_CLASSES } from "@/games/wow-forever/data/macros/macroClassFilter";
import { HOVER_CAST_MACROS } from "@/games/wow-forever/data/macros/hoverCastMacros";
import { MACRO_KIND_ORDER } from "@/games/wow-forever/data/macros/macroKinds";
import { WARLOCK_MACROS } from "@/games/wow-forever/data/macros/warlockMacros";
import { fillMacroTemplate, findMacroTemplate } from "@/games/wow-forever/lib/macros/macroTemplates";
import type { HoverCastMacro } from "@/games/wow-forever/types/macros/hoverCastMacro";
import type { Macro } from "@/games/wow-forever/types/macros/macro";
import type { MacroClassFilter } from "@/games/wow-forever/types/macros/macroClassFilter";
import type { MacroClassGroup } from "@/games/wow-forever/types/macros/macroClassGroup";

/** A template hover-cast macro as a full macro: "Rejuvenation (Druid)", its filled text, its one spell. */
export function hoverCastToMacro(macro: HoverCastMacro): Macro {
  return {
    id: macro.id,
    classId: macro.classId,
    kind: "hover",
    title: `${macro.spell} (${findClass(macro.classId)?.name ?? macro.classId})`,
    summary: macro.summary,
    text: fillMacroTemplate(findMacroTemplate(macro.template), macro.spell),
    spells: [macro.spell],
    items: [],
    unconfirmed: [],
  };
}

/** Every ready-made macro on the page, for every class. */
export const ALL_MACROS: readonly Macro[] = [...HOVER_CAST_MACROS.map(hoverCastToMacro), ...WARLOCK_MACROS];

/** Classes that have at least one macro, in the class list's order: the class picker's choices. */
export function macroClasses(macros: readonly Macro[] = ALL_MACROS): WowClass[] {
  return WOW_CLASSES.filter((c) => macros.some((m) => m.classId === c.id));
}

/**
 * The macros by class (class list order) and, within a class, by kind (hover
 * cast first). A class filter keeps just that class; kinds with no macros are
 * left out.
 */
export function macroClassGroups(filter: MacroClassFilter, macros: readonly Macro[] = ALL_MACROS): MacroClassGroup[] {
  return macroClasses(macros)
    .filter((wowClass) => filter === ALL_MACRO_CLASSES || wowClass.id === filter)
    .map((wowClass) => ({
      wowClass,
      kinds: MACRO_KIND_ORDER.map((kind) => ({
        kind,
        macros: macros.filter((m) => m.classId === wowClass.id && m.kind === kind),
      })).filter((group) => group.macros.length > 0),
    }));
}
