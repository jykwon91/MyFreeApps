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

export type MergeFieldSide = "a" | "b";

export interface MergeFieldOverrides {
  transaction_date?: MergeFieldSide;
  vendor?: MergeFieldSide;
  description?: MergeFieldSide;
  amount?: MergeFieldSide;
  category?: MergeFieldSide;
  property_id?: MergeFieldSide;
  payment_method?: MergeFieldSide;
  channel?: MergeFieldSide;
}

export interface MergeDuplicatesRequest {
  transaction_a_id: string;
  transaction_b_id: string;
  surviving_id: string;
  field_overrides: Record<string, MergeFieldSide>;
}

export interface MergeDuplicatesResponse {
  merged: boolean;
  surviving_id: string;
}

export interface DuplicatePair {
  id: string;
  transaction_a: DuplicateTransaction;
  transaction_b: DuplicateTransaction;
  date_diff_days: number;
  property_match: boolean;
  confidence: string;
}

export interface DuplicatePairsResponse {
  pairs: DuplicatePair[];
  total: number;
}
