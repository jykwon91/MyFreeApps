import { useDocumentsPages } from "@mybookkeeper/api-client/hooks/useDocumentsPages";
import { useFailedDocuments } from "@mybookkeeper/api-client/hooks/useFailedDocuments";
import type { DocumentPageArgs } from "@mybookkeeper/api-client/types/document/DocumentPageArgs";
import { useDocumentSummaryWithPolling } from "./useDocumentSummaryWithPolling";

/**
 * The list a page at a time, with the workspace's counts and its failed documents, all refreshing
 * themselves while anything in the workspace is still being read (counted by the server, so a document
 * being read on a page not loaded yet counts too).
 */
export function useDocumentsWithPolling(args: DocumentPageArgs) {
  const summary = useDocumentSummaryWithPolling();
  const polling = { pollingInterval: summary.pollingInterval };
  const list = useDocumentsPages(args, polling);
  const failed = useFailedDocuments(polling);
  return { list, summary, failed, gaveUp: summary.gaveUp };
}
