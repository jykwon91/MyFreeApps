import type { UtilityPlanRateComparisonRow } from "@/shared/types/utility/utility-plan-rate-comparison-row";

/**
 * Dashboard payload for plans priced above the market.
 *
 * Mirrors ``schemas/properties/utility_plan_rate_comparison_response.py``.
 * ``material_gap_pct`` comes from the backend so the UI can say "more than N%
 * above" without hardcoding a threshold it does not own.
 */
export interface UtilityPlanRateComparison {
  material_gap_pct: number;
  above_market: UtilityPlanRateComparisonRow[];
  not_compared: UtilityPlanRateComparisonRow[];
  total_above_market: number;
  has_stale_benchmark: boolean;
}
