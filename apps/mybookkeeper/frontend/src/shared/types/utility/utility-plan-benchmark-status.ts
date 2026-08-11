/**
 * How a plan's price compares to the recorded market benchmark.
 *
 * Mirrors ``BENCHMARK_STATUSES`` in
 * ``backend/app/core/market_benchmark_constants.py``. A value added there MUST
 * be added here in the same PR.
 */
export type UtilityPlanBenchmarkStatus =
  | "no_benchmark"
  | "not_comparable"
  | "at_or_below_market"
  | "above_market";

export const UTILITY_PLAN_BENCHMARK_STATUS_LABELS: Record<
  UtilityPlanBenchmarkStatus,
  string
> = {
  no_benchmark: "No market rate recorded",
  not_comparable: "Not comparable",
  at_or_below_market: "At or below market",
  above_market: "Above market",
};
