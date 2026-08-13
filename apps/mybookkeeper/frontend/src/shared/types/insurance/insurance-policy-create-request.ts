import type { InsurancePremiumFrequency } from "@/shared/types/insurance/insurance-premium-frequency";

/**
 * Request body for POST /insurance-policies.
 *
 * Mirrors ``schemas/insurance/insurance_policy_create_request.py``.
 */
export interface InsurancePolicyCreateRequest {
  listing_id: string;
  source_document_id?: string | null;
  policy_name: string;
  carrier?: string | null;
  policy_number?: string | null;
  effective_date?: string | null;
  expiration_date?: string | null;
  coverage_amount_cents?: number | null;
  premium_cents?: number | null;
  premium_frequency?: InsurancePremiumFrequency | null;
  deductible_cents?: number | null;
  wind_hail_deductible_pct?: string | null;
  notes?: string | null;
}
