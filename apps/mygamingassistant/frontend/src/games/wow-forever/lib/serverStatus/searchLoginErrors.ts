import { matchesAll, normalizeText, queryTokens } from "@/games/wow-forever/worldMap/searchText";
import type { LoginErrorEntry } from "@/games/wow-forever/types/serverStatus/loginErrorEntry";

function compact(text: string): string {
  return normalizeText(text).replace(/[^a-z0-9]/g, "");
}

function haystack(entry: LoginErrorEntry): string {
  return normalizeText([entry.code ?? "", entry.title, ...entry.aliases, entry.meaning].join(" "));
}

/**
 * The entries matching `query`: every word somewhere in the code, title, other names or meaning
 * (any order, accents and punctuation ignored), or the code typed without its letters or spaces
 * ("51900319", "blz 51900003"). An empty query keeps every entry, in the list's order.
 */
export function searchLoginErrors(entries: readonly LoginErrorEntry[], query: string): LoginErrorEntry[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [...entries];
  const typed = compact(query);
  return entries.filter(
    (entry) =>
      matchesAll(tokens, haystack(entry)) || (typed.length >= 4 && entry.code !== null && compact(entry.code).includes(typed)),
  );
}

/** The anchor id of an entry: `err-<id>`. */
export function loginErrorAnchor(entry: Pick<LoginErrorEntry, "id">): string {
  return `err-${entry.id}`;
}
