import type { InsuranceBenchmark } from "@/shared/types/insurance/insurance-benchmark";
import type { InsurancePremiumComparisonRow } from "@/shared/types/insurance/insurance-premium-comparison-row";

/**
 * Dashboard payload for policies priced above the market.
 *
 * Mirrors ``schemas/insurance/insurance_policy_premium_comparison_response.py``.
 * ``material_gap_pct`` comes from the backend so the UI can say "more than N%
 * above" without hardcoding a threshold it does not own.
 */
export interface InsurancePremiumComparison {
  material_gap_pct: number;
  /** The benchmark every row was measured against; null when none recorded. */
  benchmark: InsuranceBenchmark | null;
  above_market: InsurancePremiumComparisonRow[];
  not_compared: InsurancePremiumComparisonRow[];
  total_above_market: number;
  /**
   * Every unexpired policy that was looked at, including the ones that came
   * back fine. Zero means "nothing tracked"; non-zero with two empty lists
   * means "all clear" — the card cannot tell those apart without it.
   */
  total_considered: number;
  has_stale_benchmark: boolean;
}
