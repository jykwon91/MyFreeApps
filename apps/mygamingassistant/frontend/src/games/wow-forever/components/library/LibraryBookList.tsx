import { useMemo } from "react";
import LibraryBookFilters from "@/games/wow-forever/components/library/LibraryBookFilters";
import LibraryBookRow from "@/games/wow-forever/components/library/LibraryBookRow";
import { LIBRARY_CHECKLIST_STORAGE_KEY, LIBRARY_EMPTY } from "@/games/wow-forever/data/library/libraryConfig";
import { useChecklist } from "@/games/wow-forever/hooks/useChecklist";
import { useLibraryFilters } from "@/games/wow-forever/hooks/useLibraryFilters";
import { filterBooks, itemLevelCounts } from "@/games/wow-forever/lib/library/filterBooks";
import type { LibraryBook } from "@/games/wow-forever/types/library/libraryBook";

/** The loaded books: filters, a count with the checklist's reset, then the books. */
export default function LibraryBookList({ books }: { books: readonly LibraryBook[] }) {
  const { filters, update, reset } = useLibraryFilters();
  const ids = useMemo(() => books.map((b) => String(b.id)), [books]);
  const checklist = useChecklist(ids, LIBRARY_CHECKLIST_STORAGE_KEY);
  const shown = useMemo(() => filterBooks(books, filters, checklist.checked), [books, filters, checklist.checked]);
  const levels = useMemo(() => itemLevelCounts(books, filters, checklist.checked), [books, filters, checklist.checked]);
  const foundCount = books.filter((b) => checklist.checked.has(String(b.id))).length;
  const emptyText = filters.hideFound && filterBooks(books, { ...filters, hideFound: false }, checklist.checked).length > 0
    ? LIBRARY_EMPTY.allFound
    : LIBRARY_EMPTY.filtered;

  return (
    <section className="space-y-4" aria-labelledby="library-books">
      <h2 id="library-books" className="text-base font-semibold">Books</h2>
      <LibraryBookFilters filters={filters} levels={levels} onChange={update} onReset={reset} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" role="status" data-testid="library-count">
          {shown.length === 1 ? "1 book" : `${shown.length} books`} · {foundCount} of {books.length} found
        </p>
        {foundCount > 0 ? (
          <button
            type="button"
            onClick={checklist.reset}
            className="rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[32px] hover:bg-muted/40"
          >
            Clear found
          </button>
        ) : null}
      </div>
      {shown.length > 0 ? (
        <ul className="space-y-3">
          {shown.map((book) => (
            <LibraryBookRow
              key={book.id}
              book={book}
              found={checklist.checked.has(String(book.id))}
              onToggleFound={() => checklist.toggle(String(book.id))}
            />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border bg-card p-4 text-sm" data-testid="library-empty">
          <p>{emptyText}</p>
          <button type="button" onClick={reset} className="mt-2 rounded-md border px-3 min-h-[44px] hover:bg-muted/40">
            Reset filters
          </button>
        </div>
      )}
    </section>
  );
}
