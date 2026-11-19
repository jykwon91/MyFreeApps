import type { PendingReceipt } from "./pending-receipt";
import type { ReceiptGmailState } from "./receipt-gmail-state";

/** GET /rent-receipts/pending/{transaction_id}: one payment's open receipt, wherever it sits in the list. */
export interface PendingReceiptLookupResponse {
  /** Null once the receipt isn't waiting: sent, dismissed, or never queued. */
  item: PendingReceipt | null;
  gmail_state: ReceiptGmailState;
}
