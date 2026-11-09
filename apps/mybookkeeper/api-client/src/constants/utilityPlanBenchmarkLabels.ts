import type { UtilityPlanBenchmarkStatus } from "../types/utility/utility-plan-benchmark-status";

export const UTILITY_PLAN_BENCHMARK_STATUS_LABELS: Record<UtilityPlanBenchmarkStatus, string> = {
  no_benchmark: "No market rate recorded",
  not_comparable: "Not comparable",
  at_or_below_market: "At or below market",
  above_market: "Above market",
};
