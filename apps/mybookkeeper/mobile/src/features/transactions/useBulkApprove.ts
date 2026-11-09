import { useBulkApproveTransactionsMutation } from "@mybookkeeper/api-client/store/transactionsApi";
import { useToast } from "@platform/mobile";
import { bulkApproveFailureMessage, bulkApprovedMessage } from "./transactionMessages";

/** Approves several at once and says how many went through. True when the request succeeded. */
export function useBulkApprove() {
  const { showToast } = useToast();
  const [bulkApprove, { isLoading }] = useBulkApproveTransactionsMutation();

  async function approve(ids: string[]): Promise<boolean> {
    try {
      const result = await bulkApprove(ids).unwrap();
      showToast(bulkApprovedMessage(result.approved, result.skipped));
      return true;
    } catch (error) {
      showToast(bulkApproveFailureMessage(error), "error");
      return false;
    }
  }

  return { approve, isApproving: isLoading };
}
