export interface AttributionTransactionSummary {
  id: string;
  transaction_date: string;
  amount: string;
  vendor: string | null;
  payer_name: string | null;
  description: string | null;
  property_id: string | null;
}

export interface AttributionApplicantSummary {
  id: string;
  legal_name: string | null;
}

export interface AttributionReviewItem {
  id: string;
  transaction_id: string;
  proposed_applicant_id: string | null;
  confidence: "fuzzy" | "unmatched";
  status: "pending" | "confirmed" | "rejected";
  created_at: string;
  resolved_at: string | null;
  transaction: AttributionTransactionSummary | null;
  proposed_applicant: AttributionApplicantSummary | null;
}

export interface AttributionReviewQueueResponse {
  items: AttributionReviewItem[];
  total: number;
  pending_count: number;
}
