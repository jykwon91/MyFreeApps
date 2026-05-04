/**
 * Request body for POST /insurance-policies.
 *
 * Mirrors ``schemas/insurance/insurance_policy_create_request.py``.
 */
export interface InsurancePolicyCreateRequest {
  listing_id: string;
  policy_name: string;
  carrier?: string | null;
  policy_number?: string | null;
  effective_date?: string | null;
  expiration_date?: string | null;
  coverage_amount_cents?: number | null;
  notes?: string | null;
}
