import type { UtilityPlanBenchmarkStatus } from "@/shared/types/utility/utility-plan-benchmark-status";
import type { UtilityPlanSummary } from "@/shared/types/utility/utility-plan-summary";

/**
 * One plan measured against the market benchmark for its service type.
 *
 * Mirrors ``schemas/properties/utility_plan_rate_comparison_row.py``.
 * ``plan_figure`` and ``benchmark_figure`` share a unit that depends on the
 * plan's service type: ¢/kWh for metered service, cents per month for flat.
 */
export interface UtilityPlanRateComparisonRow {
  plan: UtilityPlanSummary;
  status: UtilityPlanBenchmarkStatus;
  plan_figure: string | null;
  benchmark_figure: string | null;
  /** Signed — negative means the plan beats the market. */
  gap_pct: string | null;
  benchmark_is_stale: boolean;
}
