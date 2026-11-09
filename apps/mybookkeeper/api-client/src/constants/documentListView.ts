import type { DocumentListView } from "../types/document/DocumentListView";
import type { DocumentSortFieldOption } from "../types/document/DocumentSortFieldOption";

/** The website opens newest first. */
export const DEFAULT_DOCUMENT_VIEW: DocumentListView = {
  search: "",
  statuses: [],
  types: [],
  sources: [],
  sortField: "created_at",
  sortDirection: "desc",
};

export const DOCUMENT_SORT_FIELDS: readonly DocumentSortFieldOption[] = [
  { value: "created_at", label: "Uploaded" },
  { value: "file_name", label: "File name" },
  { value: "document_type", label: "Type" },
  { value: "status", label: "Status" },
  { value: "source", label: "Source" },
];
