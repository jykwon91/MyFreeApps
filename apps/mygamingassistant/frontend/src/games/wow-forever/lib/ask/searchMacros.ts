/**
 * The Macros page's macros for a class and/or what they should do: every word
 * of the search that says something ("pet", "heal") is looked for in a
 * macro's title and kind (worth more) and its summary and spells; the best
 * matches first, then the page's own kind order. A search none of them match falls back to the class's
 * macros (`matched` false), so "best warlock macros" still finds warlock ones.
 */
import { findClass, WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";
import { MACRO_QUERY_IGNORED, MACRO_QUERY_MIN_WORD } from "@/games/wow-forever/data/ask/askMacroQuery";
import { MACRO_KIND_LABELS, MACRO_KIND_ORDER } from "@/games/wow-forever/data/macros/macroKinds";
import type { AskMacroSearch } from "@/games/wow-forever/types/ask/askMacroSearch";
import type { Macro } from "@/games/wow-forever/types/macros/macro";

const CLASS_WORDS: ReadonlySet<string> = new Set(WOW_CLASSES.map((c) => c.name.toLowerCase()));

function words(query: string | null): string[] {
  if (query === null) return [];
  return query
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= MACRO_QUERY_MIN_WORD && !MACRO_QUERY_IGNORED.has(w) && !CLASS_WORDS.has(w));
}

/** A word in the title or kind ("Pet") says more than one in the summary or spells. */
const HEADLINE_WEIGHT = 2;

function score(macro: Macro, wanted: readonly string[]): number {
  const headline = [macro.title, MACRO_KIND_LABELS[macro.kind]].join(" ").toLowerCase();
  const body = [macro.summary, ...macro.spells, findClass(macro.classId)?.name ?? ""].join(" ").toLowerCase();
  return wanted.reduce((total, w) => total + (headline.includes(w) ? HEADLINE_WEIGHT : body.includes(w) ? 1 : 0), 0);
}

function byKind(a: Macro, b: Macro): number {
  return MACRO_KIND_ORDER.indexOf(a.kind) - MACRO_KIND_ORDER.indexOf(b.kind);
}

export function searchMacros(macros: readonly Macro[], classId: WowClassId | null, query: string | null): AskMacroSearch {
  const pool = classId === null ? macros : macros.filter((m) => m.classId === classId);
  const wanted = words(query);
  if (wanted.length === 0) return { macros: [...pool].sort(byKind), matched: true };
  const scored = pool
    .map((macro) => ({ macro, score: score(macro, wanted) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || byKind(a.macro, b.macro));
  if (scored.length > 0) return { macros: scored.map((s) => s.macro), matched: true };
  return { macros: classId === null ? [] : [...pool].sort(byKind), matched: false };
}
