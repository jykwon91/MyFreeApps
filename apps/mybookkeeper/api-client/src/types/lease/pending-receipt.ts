import type { PendingReceiptStatus } from "./pending-receipt-status";
import type { ReceiptSendBlocker } from "./receipt-send-blocker";

export interface PendingReceipt {
  id: string;
  transaction_id: string;
  applicant_id: string;
  signed_lease_id: string | null;
  period_start_date: string;
  period_end_date: string;
  status: PendingReceiptStatus;
  sent_at: string | null;
  sent_via_attachment_id: string | null;
  created_at: string;
  tenant_name: string | null;
  /** Decimal string, e.g. "1450.00". */
  amount: string;
  transaction_date: string;
  payer_name: string | null;
  payment_method: string | null;
  vendor: string | null;
  send_blocker: ReceiptSendBlocker | null;
  /** The Gmail account a stuck send went through, once it isn't connected: sending can't check it, so it can be dismissed. */
  sent_from_other_gmail: string | null;
}
