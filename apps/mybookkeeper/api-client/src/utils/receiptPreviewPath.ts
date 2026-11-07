import type { ReceiptPreviewParams } from "../types/lease/receipt-preview-params";
import { localToday } from "./localToday";
import { queryString } from "./queryString";

/** Dated with the host's day: the server's UTC date is tomorrow on a US evening. */
export function receiptPreviewPath(transactionId: string, params: ReceiptPreviewParams): string {
  const query = queryString({
    period_start: params.periodStart,
    period_end: params.periodEnd,
    payment_method: params.paymentMethod,
    today: localToday(),
  });
  return `/rent-receipts/preview/${transactionId}?${query}`;
}
