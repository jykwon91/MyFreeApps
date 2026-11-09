import type { InsuranceBenchmarkStatus } from "../types/insurance/insurance-benchmark-status";

export const INSURANCE_BENCHMARK_STATUS_LABELS: Record<InsuranceBenchmarkStatus, string> = {
  no_benchmark: "No market premium recorded",
  not_comparable: "Missing premium or coverage",
  at_or_below_market: "At or below market",
  above_market: "Above market",
};
