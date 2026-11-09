import { useBulkDeleteDocumentsMutation } from "@mybookkeeper/api-client/store/documentsApi";
import type { BulkDeleteSummary } from "@mybookkeeper/api-client/types/document/BulkDeleteSummary";
import { runBulkDelete } from "@mybookkeeper/api-client/utils/bulkDeleteDocuments";
import { summariseBulkDelete } from "@mybookkeeper/api-client/utils/bulkDeleteSummary";
import { useToast } from "@platform/mobile";
import { useRef } from "react";
import { beingReadMessage, confirmDeleteBody, confirmDeleteTitle, deletedMessage, deletedSomeFailedMessage, deletedSomeGoneMessage, DOCUMENT_BULK_MESSAGES as MESSAGES } from "../../constants/documentBulk";
import { askOnce } from "../../lib/askOnce";
import { bulkDeleteFailureMessage } from "./bulkDeleteFailureMessage";

/**
 * Deletes the given documents (in batches the server accepts), as the website does, after asking.
 * `onSettled` gets the summary of what happened. Ids already gone are only reported;
 * ids refused because they are being read, or not deleted because a request failed, are for the screen to keep selected.
 */
export function useBulkDeleteDocuments(onSettled: (summary: BulkDeleteSummary) => void) {
  const { showToast } = useToast();
  const [bulkDelete, { isLoading: isDeleting }] = useBulkDeleteDocumentsMutation();
  const asking = useRef(false);

  async function remove(ids: readonly string[]): Promise<void> {
    // Same batching as the website: the server takes at most MAX_BULK_DELETE_DOCUMENT_IDS a request.
    const run = await runBulkDelete(ids, (batch) => bulkDelete(batch).unwrap());
    const summary = summariseBulkDelete(run);
    if (summary.failedIds.length > 0) {
      showToast(summary.deleted > 0 ? deletedSomeFailedMessage(summary.deleted, summary.failedIds.length) : bulkDeleteFailureMessage(run.error), "error");
    } else if (summary.beingReadIds.length > 0) showToast(beingReadMessage(summary.deleted, summary.beingReadIds.length), "error");
    else if (summary.alreadyGone > 0) showToast(deletedSomeGoneMessage(summary.deleted, summary.alreadyGone), "success");
    else showToast(deletedMessage(summary.deleted), "success");
    onSettled(summary);
  }

  function askToDelete(ids: readonly string[]): void {
    if (isDeleting || ids.length === 0) return;
    askOnce(asking, confirmDeleteTitle(ids.length), confirmDeleteBody(ids.length), {
      text: MESSAGES.delete,
      style: "destructive",
      onPress: () => void remove(ids),
    });
  }

  return { askToDelete, isDeleting };
}
