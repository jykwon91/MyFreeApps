/** `find_macros` — the Macros page's ready-made macros, by class and what they do (`searchMacros`). */
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_LIMITS } from "@/games/wow-forever/data/ask/askLimits";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { ASK_TOOL_NOTE } from "@/games/wow-forever/data/ask/askToolNotes";
import { findClass } from "@/games/wow-forever/data/classes";
import { MACRO_KIND_LABELS } from "@/games/wow-forever/data/macros/macroKinds";
import { macrosPageHref } from "@/games/wow-forever/lib/ask/askGuideLinks";
import { searchMacros } from "@/games/wow-forever/lib/ask/searchMacros";
import { ALL_MACROS } from "@/games/wow-forever/lib/macros/macroCatalog";
import type { AskMacroRow } from "@/games/wow-forever/types/ask/askMacroRow";
import type { AskMacrosInput } from "@/games/wow-forever/types/ask/askMacrosInput";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";
import type { Macro } from "@/games/wow-forever/types/macros/macro";

function className(macro: Macro): string {
  return findClass(macro.classId)?.name ?? macro.classId;
}

function macroRow(macro: Macro): AskMacroRow {
  return {
    id: macro.id,
    title: macro.title,
    summary: macro.summary,
    text: macro.text,
    unconfirmed: macro.unconfirmed,
  };
}

export function findMacrosTool(input: AskMacrosInput): AskToolOutcome {
  const found = searchMacros(ALL_MACROS, input.classId, input.query);
  const shown = found.macros.slice(0, Math.min(input.limit, ASK_LIMITS.cardRows));
  const result = {
    class: input.classId === null ? null : (findClass(input.classId)?.name ?? input.classId),
    query: input.query,
    ...(found.matched ? {} : { note: ASK_TOOL_NOTE.macrosFallback }),
    results: shown.map((m, i) => ({
      n: i + 1,
      title: m.title,
      class: className(m),
      kind: MACRO_KIND_LABELS[m.kind],
      does: m.summary,
      unconfirmed_in_forever: m.unconfirmed.length > 0,
    })),
    total: found.macros.length,
  };
  const card: AskToolOutcome["card"] = shown.length
    ? { kind: ASK_CARD.macros, macros: shown.map(macroRow), total: found.macros.length, pageHref: macrosPageHref(input.classId) }
    : { kind: ASK_CARD.noResults, tool: ASK_TOOL.findMacros, query: input.query ?? "" };
  return { content: JSON.stringify(result), isError: false, card };
}
