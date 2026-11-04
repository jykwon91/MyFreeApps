export interface DuplicateTransaction {
  id: string;
  transaction_date: string;
  vendor: string | null;
  description: string | null;
  amount: string;
  transaction_type: string;
  category: string;
  property_id: string | null;
  payment_method: string | null;
  channel: string | null;
  tags: string[];
  status: string;
  source_document_id: string | null;
  source_file_name: string | null;
  is_manual: boolean;
  created_at: string;
  linked_document_ids: string[];
}
