import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import type { TransactionUpdateResult } from "@mybookkeeper/api-client/types/transaction/TransactionUpdateResult";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { unsureSavedMessage } from "../../lib/writeFailureCopy";
import { unsureRepeatableMessage } from "@platform/core/utils/unsureRepeatableMessage";

/*
 * The server's own wording can be a developer string, so it's never shown. A lost answer or a proxy error can come after the
 * write landed (see writeOutcome), so it's never called a failure. Saving a change, approving and deleting are safe to send
 * again; adding one isn't.
 */

export function saveFailureMessage(error: unknown): string {
  if (writeOutcome(error) === "unknown") return unsureRepeatableMessage("that saved");
  switch (httpStatus(error)) {
    case 403:
      return "You have read-only access, so I can't change this.";
    case 404:
      return "I can't find that transaction anymore. It may have been deleted.";
    default:
      return "I couldn't save that. Want to try again?";
  }
}

export function approveFailureMessage(error: unknown): string {
  if (writeOutcome(error) === "unknown") return unsureRepeatableMessage("that was approved");
  switch (httpStatus(error)) {
    case 403:
      return "You have read-only access, so I can't change this.";
    case 404:
      return "I can't find that transaction anymore. It may have been deleted.";
    default:
      return "I couldn't approve that one. Want to try again?";
  }
}

export function othersUpdatedSentence(result: TransactionUpdateResult, vendor: string | null): string {
  const count = result.retroactive_count ?? 0;
  if (count === 0) return "";
  const who = vendor ? `${vendor} ` : "";
  return ` I also updated ${count} other ${who}${count === 1 ? "transaction" : "transactions"}.`;
}

export function createFailureMessage(error: unknown): string {
  if (writeOutcome(error) === "unknown") return unsureSavedMessage("transactions");
  return httpStatus(error) === 403 ? "You have read-only access, so I can't add transactions." : "I couldn't add that. Want to try again?";
}

export function bulkApproveFailureMessage(error: unknown): string {
  if (writeOutcome(error) === "unknown") return unsureRepeatableMessage("those were approved");
  switch (httpStatus(error)) {
    case 403:
      return "You have read-only access, so I can't change these.";
    default:
      return "I couldn't approve those. Want to try again?";
  }
}

export const BULK_TRANSACTION_MESSAGES = {
  delete: "Delete",
  deleting: "Deleting\u2026",
  approving: "Approving\u2026",
} as const;

export function bulkDeleteFailureMessage(error: unknown): string {
  if (writeOutcome(error) === "unknown") return unsureRepeatableMessage("those were deleted");
  switch (httpStatus(error)) {
    case 403:
      return "You have read-only access, so I can't delete these.";
    default:
      return "I couldn't delete those. Want to try again?";
  }
}

/** A 404 is handled by the caller: the transaction is already gone. */
export function deleteFailureMessage(error: unknown): string {
  return writeOutcome(error) === "unknown" ? unsureRepeatableMessage("that was deleted") : "I couldn't delete that. Want to try again?";
}

export function bulkDeleteConfirmTitle(count: number): string {
  return count === 1 ? "Delete 1 transaction?" : `Delete ${count} transactions?`;
}

export function bulkDeleteConfirmBody(count: number): string {
  return `${count === 1 ? "It'll" : "They'll"} be removed from your books. This can't be undone.`;
}
