import type { SortDirection } from "../sort/SortDirection";
import type { DocumentSortField } from "./DocumentSortField";

/** How a list of documents is narrowed and ordered. An empty choice list means no narrowing on that column. */
export interface DocumentListView {
  search: string;
  statuses: readonly string[];
  types: readonly string[];
  sources: readonly string[];
  sortField: DocumentSortField;
  sortDirection: SortDirection;
}
