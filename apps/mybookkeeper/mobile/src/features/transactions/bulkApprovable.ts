import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { isReviewable } from "./transactionDisplay";

/** The website's rule: waiting for review, and a property to file it under. */
export function isBulkApprovable(transaction: Transaction): boolean {
  return transaction.property_id !== null && isReviewable(transaction.status);
}
