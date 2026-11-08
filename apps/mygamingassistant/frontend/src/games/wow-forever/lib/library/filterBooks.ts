import { matchesAll, normalizeText, queryTokens } from "@/games/wow-forever/worldMap/searchText";
import type { LibraryBook } from "@/games/wow-forever/types/library/libraryBook";
import type { LibraryFilters } from "@/games/wow-forever/types/library/libraryFilters";

function matchesQuery(book: LibraryBook, tokens: readonly string[]): boolean {
  return tokens.length === 0 || matchesAll(tokens, normalizeText(`${book.name} ${book.description}`));
}

/** The books the filters keep: every search word (name or description, any order), the item level, found hidden or not. */
export function filterBooks(
  books: readonly LibraryBook[],
  filters: LibraryFilters,
  found: ReadonlySet<string>,
): LibraryBook[] {
  const tokens = queryTokens(filters.query);
  return books.filter(
    (book) =>
      matchesQuery(book, tokens) &&
      (filters.itemLevel === null || book.itemLevel === filters.itemLevel) &&
      !(filters.hideFound && found.has(String(book.id))),
  );
}

/** Each item level the books come in, lowest first, with how many books the other filters leave at it. */
export function itemLevelCounts(
  books: readonly LibraryBook[],
  filters: LibraryFilters,
  found: ReadonlySet<string>,
): { itemLevel: number; count: number }[] {
  const levels = [...new Set(books.map((b) => b.itemLevel))].sort((a, b) => a - b);
  const others = filterBooks(books, { ...filters, itemLevel: null }, found);
  return levels.map((itemLevel) => ({ itemLevel, count: others.filter((b) => b.itemLevel === itemLevel).length }));
}
