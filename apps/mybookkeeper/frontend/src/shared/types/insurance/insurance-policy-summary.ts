import type { InsurancePremiumFrequency } from "@/shared/types/insurance/insurance-premium-frequency";

/**
 * Summary row for the insurance policy list.
 *
 * Mirrors ``schemas/insurance/insurance_policy_summary.py``.
 *
 * ``wind_hail_deductible_pct`` arrives as a JSON *string* because the backend
 * column is ``Numeric`` — see ``shared/lib/insurance-policy-format.ts``, which
 * is the only place it is parsed.
 */
export interface InsurancePolicySummary {
  id: string;
  property_id: string;
  property_name: string | null;
  policy_name: string;
  carrier: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  coverage_amount_cents: number | null;
  premium_cents: number | null;
  premium_frequency: InsurancePremiumFrequency | null;
  /** Fees, surcharges and taxes for the policy term, not per billing period. */
  fees_and_taxes_cents: number | null;
  deductible_cents: number | null;
  wind_hail_deductible_pct: string | null;
  /**
   * Derived server-side from premium + frequency; never sent on write.
   * The premium ALONE — this is the half comparable to a benchmark.
   */
  annual_premium_cents: number | null;
  /** A year of premium plus the term's fees and taxes — what is paid. */
  annual_total_cents: number | null;
  created_at: string;
  updated_at: string;
}
