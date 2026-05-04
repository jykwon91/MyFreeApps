/**
 * Summary row for the insurance policy list.
 *
 * Mirrors ``schemas/insurance/insurance_policy_summary.py``.
 */
export interface InsurancePolicySummary {
  id: string;
  listing_id: string;
  policy_name: string;
  carrier: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  coverage_amount_cents: number | null;
  created_at: string;
  updated_at: string;
}
