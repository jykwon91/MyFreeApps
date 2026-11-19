import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { PendingReceipt } from "./pending-receipt";
import type { ReceiptGmailState } from "./receipt-gmail-state";

/**
 * The pending receipts list a page at a time, as a screen needs it: `receipts` is every loaded row, in the
 * server's order, `total` every open receipt, and `gmailState` the latest page's answer ("ready" before one loads).
 */
export interface PendingReceiptsPagesState extends Omit<InfinitePagesResult<PendingReceipt>, "items"> {
  receipts: PendingReceipt[];
  gmailState: ReceiptGmailState;
}
