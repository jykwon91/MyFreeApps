import { getApiErrorDetail } from "@/shared/lib/api-error-detail";

/**
 * What to tell the operator when sending a rent receipt fails.
 *
 * The server sends a receipt at most once, so several of these mean "nothing
 * to do" rather than "try again". The codes mirror
 * ``app/services/leases/receipt_send_error_details.py``.
 */

export const RECEIPT_SEND_FALLBACK_MESSAGE = "Couldn't send the receipt. Please try again.";

const RECEIPT_SEND_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  receipt_already_sent: "That receipt already went out, so I didn't send it again.",
  receipt_dismissed: "That receipt was dismissed, so I didn't send it.",
  receipt_send_in_progress:
    "I'm still confirming an earlier send of this receipt with Gmail. Give me about 15 minutes, then try again — I won't email it twice.",
  receipt_send_unconfirmed:
    "Gmail didn't tell me whether the receipt went out. Give me about 15 minutes, then try again — I'll check Gmail first so your tenant doesn't get it twice.",
  receipt_sent_not_recorded:
    "The receipt was emailed, but I couldn't save that it was sent. Try again in about 15 minutes and I'll record it — I won't email it twice.",
  gmail_reauth_required:
    "Gmail needs to be reconnected before sending receipts. Go to Integrations → Reconnect Gmail.",
};

/** Codes after which the receipt is finished and the dialog has nothing left to do. */
export const RECEIPT_SEND_FINISHED_CODES: ReadonlySet<string> = new Set([
  "receipt_already_sent",
  "receipt_dismissed",
]);

export function receiptSendErrorDetail(error: unknown): string {
  return getApiErrorDetail(error, "");
}

export function receiptSendErrorMessage(detail: string): string {
  if (detail === "") return RECEIPT_SEND_FALLBACK_MESSAGE;
  return RECEIPT_SEND_ERROR_MESSAGES[detail] ?? detail;
}
