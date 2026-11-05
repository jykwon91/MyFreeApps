import type { PendingReceipt } from "./pending-receipt";
import type { ReceiptGmailState } from "./receipt-gmail-state";

export interface PendingReceiptListResponse {
  items: PendingReceipt[];
  /** Every open receipt, not just this page. Same as `pending_count`. */
  total: number;
  pending_count: number;
  gmail_state: ReceiptGmailState;
}
