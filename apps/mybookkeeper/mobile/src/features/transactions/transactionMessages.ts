import type { TransactionUpdateResult } from "@mybookkeeper/api-client/types/transaction/TransactionUpdateResult";

export function httpStatus(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error ? (error.status as number | undefined) : undefined;
}

/** The server's own wording can be a developer string, so it's never shown. */
export function saveFailureMessage(error: unknown): string {
  switch (httpStatus(error)) {
    case undefined:
      return "I can't reach the server, so I couldn't save that. Your changes are still here.";
    case 403:
      return "You have read-only access, so I can't change this.";
    case 404:
      return "I can't find that transaction anymore. It may have been deleted.";
    default:
      return "I couldn't save that. Want to try again?";
  }
}

export function approveFailureMessage(error: unknown): string {
  switch (httpStatus(error)) {
    case undefined:
      return "I can't reach the server, so I couldn't approve that.";
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
