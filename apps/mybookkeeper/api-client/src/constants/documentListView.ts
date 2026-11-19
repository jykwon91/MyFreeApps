import type { DocumentListView } from "../types/document/DocumentListView";
import type { DocumentPageArgs } from "../types/document/DocumentPageArgs";
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

/** Only the documents that failed to read: what "Show failed" opens, and what the failed notice counts. */
export const FAILED_DOCUMENTS_VIEW: DocumentListView = { ...DEFAULT_DOCUMENT_VIEW, statuses: ["failed"] };

/** What the library holds, newest first: the website's Documents list and the "pick one you've uploaded" pickers. */
export const DOCUMENT_LIBRARY_VIEW: DocumentPageArgs = { ...DEFAULT_DOCUMENT_VIEW, excludeProcessing: true };
