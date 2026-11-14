import type { DocumentListView } from "../types/document/DocumentListView";
import type { DocumentSortField } from "../types/document/DocumentSortField";
import type { SortFieldOption } from "../types/sort/SortFieldOption";

/** The website opens newest first. */
export const DEFAULT_DOCUMENT_VIEW: DocumentListView = {
  search: "",
  statuses: [],
  types: [],
  sources: [],
  sortField: "created_at",
  sortDirection: "desc",
};

export const DOCUMENT_SORT_FIELDS: readonly SortFieldOption<DocumentSortField>[] = [
  { value: "created_at", label: "Uploaded" },
  { value: "file_name", label: "File name" },
  { value: "document_type", label: "Type" },
  { value: "status", label: "Status" },
  { value: "source", label: "Source" },
];
