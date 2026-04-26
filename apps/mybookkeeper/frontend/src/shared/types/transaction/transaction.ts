export type TransactionType = "income" | "expense";

export type TransactionStatus = "pending" | "approved" | "needs_review" | "duplicate" | "unverified";

export interface Transaction {
  id: string;
  organization_id: string;
  user_id: string;
  property_id: string | null;
  extraction_id: string | null;
  transaction_date: string;
  tax_year: number;
  vendor: string | null;
  description: string | null;
  amount: string;
  transaction_type: TransactionType;
  category: string;
  tags: string[];
  tax_relevant: boolean;
  schedule_e_line: string | null;
  is_capital_improvement: boolean;
  placed_in_service_date: string | null;
  channel: string | null;
  address: string | null;
  payment_method: string | null;
  status: TransactionStatus;
  review_fields: string[] | null;
  review_reason: string | null;
  reconciled: boolean;
  reconciled_at: string | null;
  is_manual: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  source_document_id: string | null;
  source_file_name: string | null;
  linked_document_ids: string[];
  external_id: string | null;
  external_source: string | null;
  is_pending: boolean;
  activity_id: string | null;
}
