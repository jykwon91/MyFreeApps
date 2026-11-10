import { useBulkDeleteTransactionsMutation } from "@mybookkeeper/api-client/store/transactionsApi";
import { bulkDeleteMessage } from "@mybookkeeper/api-client/utils/bulkTransactionMessages";
import { useRef } from "react";
import { DELETE_COUNT_KEYS } from "../../constants/transactionBulk";
import { askOnce } from "../../lib/askOnce";
import { bulkDeleteConfirmBody, bulkDeleteConfirmTitle, bulkDeleteFailureMessage, BULK_TRANSACTION_MESSAGES } from "./transactionMessages";
import { useBulkTransactionRun } from "./useBulkTransactionRun";

/**
 * Deletes the given transactions after asking, as the website does. `onSettled` gets the ids that were sent and
 * the ones among them that were not deleted because a request failed, for the screen to keep selected.
 */
export function useBulkDeleteTransactions(onSettled: (sentIds: readonly string[], failedIds: string[]) => void) {
  const [bulkDelete] = useBulkDeleteTransactionsMutation();
  const { run, isRunning } = useBulkTransactionRun({
    keys: DELETE_COUNT_KEYS,
    send: (batch) => bulkDelete(batch).unwrap(),
    outcome: bulkDeleteMessage,
    failure: bulkDeleteFailureMessage,
  });
  const asking = useRef(false);

  function askToDelete(ids: readonly string[]): void {
    if (isRunning || ids.length === 0) return;
    askOnce(asking, bulkDeleteConfirmTitle(ids.length), bulkDeleteConfirmBody(ids.length), {
      text: BULK_TRANSACTION_MESSAGES.delete,
      style: "destructive",
      onPress: () => void run(ids).then((failedIds) => onSettled(ids, failedIds)),
    });
  }

  return { askToDelete, isDeleting: isRunning };
}
