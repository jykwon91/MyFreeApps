export type PendingReceiptStatus = "pending" | "sent" | "dismissed";

export interface PendingReceipt {
  id: string;
  user_id: string;
  organization_id: string;
  transaction_id: string;
  applicant_id: string;
  signed_lease_id: string | null;
  period_start_date: string;
  period_end_date: string;
  status: PendingReceiptStatus;
  sent_at: string | null;
  sent_via_attachment_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PendingReceiptListResponse {
  items: PendingReceipt[];
  total: number;
  pending_count: number;
}

export interface SendReceiptRequest {
  period_start: string;
  period_end: string;
  payment_method?: string | null;
}

export interface SendReceiptResponse {
  receipt_number: string;
  attachment_id: string;
}
