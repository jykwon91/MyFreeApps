/**
 * Request body for PATCH /insurance-policies/{id}.
 *
 * Mirrors ``schemas/insurance/insurance_policy_update_request.py``.
 */
export interface InsurancePolicyUpdateRequest {
  policy_name?: string;
  carrier?: string | null;
  policy_number?: string | null;
  effective_date?: string | null;
  expiration_date?: string | null;
  coverage_amount_cents?: number | null;
  notes?: string | null;
}
