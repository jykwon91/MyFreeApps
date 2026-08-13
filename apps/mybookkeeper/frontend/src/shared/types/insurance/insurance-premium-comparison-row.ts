import type { InsuranceBenchmarkStatus } from "@/shared/types/insurance/insurance-benchmark-status";
import type { InsurancePolicySummary } from "@/shared/types/insurance/insurance-policy-summary";

/**
 * One policy measured against the organization's insurance benchmark.
 *
 * Mirrors ``schemas/insurance/insurance_policy_premium_comparison_row.py``.
 * Both rate figures are cents of annual premium per $1,000 of dwelling
 * coverage — raw premiums are never compared, since a $1,400 policy on a
 * $250,000 house and a $1,400 policy on a $500,000 house are not the same deal.
 */
export interface InsurancePremiumComparisonRow {
  policy: InsurancePolicySummary;
  status: InsuranceBenchmarkStatus;
  policy_rate_cents_per_1000: string | null;
  benchmark_rate_cents_per_1000: string | null;
  /** Signed — negative means the policy beats the market. */
  gap_pct: string | null;
  benchmark_is_stale: boolean;
}
