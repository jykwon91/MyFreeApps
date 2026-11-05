import type { AttributionApplicantSummary } from "./attribution-applicant-summary";
import type { AttributionPropertySummary } from "./attribution-property-summary";
import type { AttributionTransactionSummary } from "./attribution-transaction-summary";

export interface AttributionReviewItem {
  id: string;
  transaction_id: string;
  proposed_applicant_id: string | null;
  proposed_property_id: string | null;
  confidence: "fuzzy" | "unmatched";
  status: "pending" | "confirmed" | "rejected";
  created_at: string;
  resolved_at: string | null;
  transaction: AttributionTransactionSummary | null;
  proposed_applicant: AttributionApplicantSummary | null;
  proposed_property: AttributionPropertySummary | null;
}
