import { RECEIPT_SEND_ERROR_MESSAGES } from "../constants/receiptSendErrorMessages";
import type { ReceiptSendErrorCode } from "../types/lease/receipt-send-error-code";

/** The send route's code in a `detail`, or null for anything else, such as a 422's sentence. */
export function receiptSendErrorCode(detail: unknown): ReceiptSendErrorCode | null {
  return typeof detail === "string" && Object.prototype.hasOwnProperty.call(RECEIPT_SEND_ERROR_MESSAGES, detail)
    ? (detail as ReceiptSendErrorCode)
    : null;
}
