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
