import { FUZZY_MIN_TOKEN_LENGTH, LEVEL_60_REQUIREMENT } from "@/games/wow-forever/data/itemSearchConfig";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { ItemSearchFilters } from "@/games/wow-forever/types/itemSearchFilters";
import type { ItemSearchResult } from "@/games/wow-forever/types/itemSearchResult";

const APOSTROPHES = /['‘’`]/g;
const DIACRITICS = /[̀-ͯ]/g;
const NOT_WORD = /[^a-z0-9]+/g;
const NUMERIC = /^\d+$/;

/** Lowercase, accents off, apostrophes dropped ("Crusader's" → "crusaders"), other punctuation → spaces. */
export function normalizeItemName(text: string): string {
  return text
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(APOSTROPHES, "")
    .replace(NOT_WORD, " ")
    .trim();
}

export function nameWords(normalized: string): string[] {
  return normalized === "" ? [] : normalized.split(" ");
}

/** True when `a` and `b` differ by at most one insertion, deletion or substitution. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenMatchesWord(token: string, word: string, fuzzy: boolean): boolean {
  if (word.startsWith(token)) return true;
  if (!fuzzy || token.length < FUZZY_MIN_TOKEN_LENGTH) return false;
  // One letter off against the whole word or against its start ("lionhart" → "lionheart").
  return withinOneEdit(token, word) || withinOneEdit(token, word.slice(0, token.length));
}

/** Every token matches the start of some word, in any order; unmatched number tokens are ignored. */
export function matchesNameWords(tokens: readonly string[], words: readonly string[], fuzzy: boolean): boolean {
  let matchedWords = 0;
  for (const token of tokens) {
    const hit = words.some((w) => tokenMatchesWord(token, w, fuzzy));
    if (hit) matchedWords += 1;
    else if (!NUMERIC.test(token)) return false;
  }
  return matchedWords > 0;
}

/** 0 exact name, 1 name starts with the query, 2 the rest. */
function nameRank(query: string, name: string): number {
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  return 2;
}

function bracketRank(item: ClientItem, bracket: ItemSearchFilters["bracket"]): number {
  const endGame = item.requiredLevel >= LEVEL_60_REQUIREMENT;
  return (bracket === "level60") === endGame ? 0 : 1;
}

function usableBy(item: ClientItem, classId: ItemSearchFilters["usableBy"]): boolean {
  return classId === null || item.classes === null || item.classes.includes(classId);
}

function run(list: ClientItemList, query: string, tokens: readonly string[], filters: ItemSearchFilters, fuzzy: boolean) {
  const found: { item: ClientItem; rank: number }[] = [];
  let hiddenByClass = 0;
  list.items.forEach((item, i) => {
    if (filters.slot !== null && item.slot !== filters.slot) return;
    if (filters.fits && !filters.fits(item)) return;
    if (!matchesNameWords(tokens, list.searchWords[i], fuzzy)) return;
    if (!usableBy(item, filters.usableBy)) {
      hiddenByClass += 1;
      return;
    }
    found.push({ item, rank: nameRank(query, list.searchNames[i]) });
  });
  return { found, hiddenByClass };
}

/**
 * Items whose name matches the query: exact name first, then names starting
 * with it, then the rest; ties go to the bracket's level range, then higher
 * item level, then name. Spelling-tolerant matching only runs when nothing
 * matches exactly.
 */
export function searchItems(list: ClientItemList, rawQuery: string, filters: ItemSearchFilters): ItemSearchResult {
  const query = normalizeItemName(rawQuery);
  const tokens = nameWords(query);
  if (tokens.length === 0) return { items: [], fuzzy: false, hiddenByClass: 0 };
  let fuzzy = false;
  let outcome = run(list, query, tokens, filters, false);
  if (outcome.found.length === 0 && outcome.hiddenByClass === 0) {
    fuzzy = true;
    outcome = run(list, query, tokens, filters, true);
  }
  const items = outcome.found
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        bracketRank(a.item, filters.bracket) - bracketRank(b.item, filters.bracket) ||
        b.item.itemLevel - a.item.itemLevel ||
        a.item.name.localeCompare(b.item.name),
    )
    .map((f) => f.item);
  return { items, fuzzy, hiddenByClass: outcome.hiddenByClass };
}

/** Real names from the list for the empty search box's hint (the preferred ids, else the first items). */
export function exampleItemNames(list: ClientItemList, preferredIds: readonly number[], count = 2): string[] {
  const preferred = preferredIds.flatMap((id) => list.byId.get(id) ?? []);
  const picks = preferred.length >= count ? preferred : [...preferred, ...list.items];
  return [...new Set(picks.map((i) => i.name))].slice(0, count);
}

/** Ids of items that would look identical in the results (same name, item level and requirement). */
export function ambiguousItemIds(items: readonly ClientItem[]): ReadonlySet<number> {
  const counts = new Map<string, number>();
  const key = (i: ClientItem) => `${i.name}|${i.itemLevel}|${i.requiredLevel}`;
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return new Set(items.filter((i) => (counts.get(key(i)) ?? 0) > 1).map((i) => i.id));
}
