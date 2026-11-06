import { RECEIPT_SEND_ERROR_MESSAGES } from "../constants/receiptSendErrorMessages";
import type { ReceiptSendErrorCode } from "../types/lease/receipt-send-error-code";

/**
 * The send route's code in a `detail`, or null for anything else, such as a 422's sentence.
 * Most codes are the whole detail; a refusal that names an account carries its code in `code`.
 */
export function receiptSendErrorCode(detail: unknown): ReceiptSendErrorCode | null {
  const code = typeof detail === "object" && detail !== null ? (detail as { code?: unknown }).code : detail;
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(RECEIPT_SEND_ERROR_MESSAGES, code)
    ? (code as ReceiptSendErrorCode)
    : null;
}
