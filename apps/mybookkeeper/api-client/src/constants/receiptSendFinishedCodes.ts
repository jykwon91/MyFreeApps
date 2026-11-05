import type { ReceiptSendErrorCode } from "../types/lease/receipt-send-error-code";

/** Codes after which the receipt is finished, so there's nothing left to send. */
export const RECEIPT_SEND_FINISHED_CODES: ReadonlySet<ReceiptSendErrorCode> = new Set<ReceiptSendErrorCode>([
  "receipt_already_sent",
  "receipt_dismissed",
]);
