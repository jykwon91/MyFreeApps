import type { TransactionSelectionRef } from "@mybookkeeper/api-client/types/transaction/TransactionSelectionRef";
import { hasProperty } from "@mybookkeeper/api-client/utils/transactionSelectionRef";
import { isReviewable } from "./transactionDisplay";

/** The website's rule: waiting for review, and a property, or a split across several, to file it under. */
export function isBulkApprovable(transaction: TransactionSelectionRef): boolean {
  return hasProperty(transaction) && isReviewable(transaction.status);
}
