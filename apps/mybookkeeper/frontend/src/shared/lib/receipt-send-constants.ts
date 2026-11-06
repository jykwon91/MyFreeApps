import { RECEIPT_SEND_FINISHED_CODES } from "@mybookkeeper/api-client/constants/receiptSendFinishedCodes";
import type { ReceiptSendErrorCode } from "@mybookkeeper/api-client/types/lease/receipt-send-error-code";

export const RECEIPT_SEND_FALLBACK_MESSAGE = "Couldn't send the receipt. Please try again.";

/** Codes whose fix is reconnecting Gmail on the Integrations page. */
export const RECEIPT_SEND_FIXED_BY_RECONNECTING: ReadonlySet<ReceiptSendErrorCode> = new Set<ReceiptSendErrorCode>([
  "gmail_reauth_required",
  "receipt_sent_from_other_gmail",
]);

/**
 * Codes after which sending again from the dialog can't help: the receipt is finished,
 * or it went through an account that has to be reconnected first.
 */
export const RECEIPT_SEND_NOTHING_TO_SEND_HERE: ReadonlySet<ReceiptSendErrorCode> = new Set<ReceiptSendErrorCode>([
  ...RECEIPT_SEND_FINISHED_CODES,
  "receipt_sent_from_other_gmail",
]);
