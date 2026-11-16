import type { TransactionSelectionRef } from "@mybookkeeper/api-client/types/transaction/TransactionSelectionRef";
import { isReviewable } from "./transactionDisplay";

/** The website's rule: waiting for review, and a property to file it under. */
export function isBulkApprovable(transaction: Pick<TransactionSelectionRef, "property_id" | "status">): boolean {
  return transaction.property_id !== null && isReviewable(transaction.status);
}
