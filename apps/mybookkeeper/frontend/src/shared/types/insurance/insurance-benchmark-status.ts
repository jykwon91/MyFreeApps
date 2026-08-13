/**
 * How a policy's premium compares to the recorded market benchmark.
 *
 * Mirrors ``BENCHMARK_STATUSES`` in
 * ``backend/app/core/insurance_benchmark_constants.py``. A value added there
 * MUST be added here in the same PR.
 */
export type InsuranceBenchmarkStatus =
  | "no_benchmark"
  | "not_comparable"
  | "at_or_below_market"
  | "above_market";

export const INSURANCE_BENCHMARK_STATUS_LABELS: Record<
  InsuranceBenchmarkStatus,
  string
> = {
  no_benchmark: "No market premium recorded",
  not_comparable: "Missing premium or coverage",
  at_or_below_market: "At or below market",
  above_market: "Above market",
};
