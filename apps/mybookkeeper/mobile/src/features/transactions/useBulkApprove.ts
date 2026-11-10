import { useBulkApproveTransactionsMutation } from "@mybookkeeper/api-client/store/transactionsApi";
import { bulkApproveMessage } from "@mybookkeeper/api-client/utils/bulkTransactionMessages";
import { APPROVE_COUNT_KEYS } from "../../constants/transactionBulk";
import { bulkApproveFailureMessage } from "./transactionMessages";
import { useBulkTransactionRun } from "./useBulkTransactionRun";

/** Approves several at once; answers with the ids that were not approved because a request failed. */
export function useBulkApprove() {
  const [bulkApprove] = useBulkApproveTransactionsMutation();
  const { run, isRunning } = useBulkTransactionRun({
    keys: APPROVE_COUNT_KEYS,
    send: (batch) => bulkApprove(batch).unwrap(),
    outcome: bulkApproveMessage,
    failure: bulkApproveFailureMessage,
  });
  return { approve: run, isApproving: isRunning };
}
