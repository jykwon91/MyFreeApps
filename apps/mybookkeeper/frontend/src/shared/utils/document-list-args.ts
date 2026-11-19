import type { ColumnFiltersState, SortingState } from "@tanstack/react-table";
import { DOCUMENT_LIBRARY_VIEW, DOCUMENT_SORT_FIELDS } from "@mybookkeeper/api-client/constants/documentListView";
import type { DocumentPageArgs } from "@mybookkeeper/api-client/types/document/DocumentPageArgs";
import type { DocumentSortField } from "@mybookkeeper/api-client/types/document/DocumentSortField";

const SORT_FIELDS: ReadonlySet<string> = new Set(DOCUMENT_SORT_FIELDS.map((option) => option.value));

function isDocumentSortField(id: string): id is DocumentSortField {
  return SORT_FIELDS.has(id);
}

function chosen(columnFilters: ColumnFiltersState, id: string): readonly string[] {
  const value = columnFilters.find((filter) => filter.id === id)?.value;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** The Documents table's search, column filters and sorted column, as what the server narrows and orders by. */
export function documentListArgs(
  search: string,
  columnFilters: ColumnFiltersState,
  sorting: SortingState,
): DocumentPageArgs {
  const sorted = sorting[0];
  const sortField = sorted && isDocumentSortField(sorted.id) ? sorted.id : undefined;
  return {
    ...DOCUMENT_LIBRARY_VIEW,
    search,
    statuses: chosen(columnFilters, "status"),
    types: chosen(columnFilters, "document_type"),
    sources: chosen(columnFilters, "source"),
    sortField: sortField ?? DOCUMENT_LIBRARY_VIEW.sortField,
    sortDirection: sortField ? (sorted?.desc ? "desc" : "asc") : DOCUMENT_LIBRARY_VIEW.sortDirection,
  };
}
