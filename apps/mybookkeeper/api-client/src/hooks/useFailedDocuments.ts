import { FAILED_DOCUMENTS_VIEW } from "../constants/documentListView";
import type { DocumentPagesOptions } from "../types/document/DocumentPagesOptions";
import type { FailedDocuments } from "../types/document/FailedDocuments";
import { useDocumentsPages } from "./useDocumentsPages";

/** Every failed document in the workspace, counted by the server rather than from the rows a list has loaded. */
export function useFailedDocuments(options: DocumentPagesOptions = {}): FailedDocuments {
  const pages = useDocumentsPages(FAILED_DOCUMENTS_VIEW, options);
  return { count: pages.total, newest: pages.documents[0] };
}
