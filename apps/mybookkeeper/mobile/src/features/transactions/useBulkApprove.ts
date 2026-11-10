import { useState } from "react";
import { useBulkApproveTransactionsMutation } from "@mybookkeeper/api-client/store/transactionsApi";
import { runBulkCounts } from "@mybookkeeper/api-client/utils/runBulkCounts";
import { useToast } from "@platform/mobile";
import { bulkApproveFailureMessage, bulkApprovedMessage, bulkApprovedSomeFailedMessage } from "./transactionMessages";

/**
 * Approves several at once, in batches the server accepts, and says how many went through.
 * True only when every batch succeeded.
 */
export function useBulkApprove() {
  const { showToast } = useToast();
  const [bulkApprove] = useBulkApproveTransactionsMutation();
  const [isApproving, setIsApproving] = useState(false);

  async function approve(ids: string[]): Promise<boolean> {
    setIsApproving(true);
    try {
      const run = await runBulkCounts(ids, ["approved", "skipped"], (batch) => bulkApprove(batch).unwrap());
      if (run.failedIds.length === 0) {
        showToast(bulkApprovedMessage(run.counts.approved, run.counts.skipped));
        return true;
      }
      showToast(
        run.counts.approved + run.counts.skipped > 0
          ? bulkApprovedSomeFailedMessage(run.counts.approved, run.counts.skipped)
          : bulkApproveFailureMessage(run.error),
        "error",
      );
      return false;
    } finally {
      setIsApproving(false);
    }
  }

  return { approve, isApproving };
}
