import type { ColumnFiltersState, OnChangeFn, SortingState } from "@tanstack/react-table";
import type { DocumentPageArgs } from "@mybookkeeper/api-client/types/document/DocumentPageArgs";

/** The Documents table's search box, column filters and sorting, and what they ask the server for. */
export interface DocumentListControls {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  columnFilters: ColumnFiltersState;
  setColumnFilters: OnChangeFn<ColumnFiltersState>;
  sorting: SortingState;
  setSorting: OnChangeFn<SortingState>;
  /** Narrows the list to the failed documents, clearing the search and the other filters. */
  showFailed: () => void;
  args: DocumentPageArgs;
}
