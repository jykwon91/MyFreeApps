import type { MarketRateBenchmark } from "@mybookkeeper/api-client/types/utility/market-rate-benchmark";

export function aBenchmark(overrides: Partial<MarketRateBenchmark> = {}): MarketRateBenchmark {
  return {
    id: "b1",
    service_type: "electricity",
    rate_cents_per_kwh: "11.0000",
    monthly_cents: null,
    source: "Power to Choose",
    observed_on: "2026-01-05",
    notes: null,
    is_stale: false,
    created_at: "2026-01-05T00:00:00Z",
    updated_at: "2026-01-05T00:00:00Z",
    ...overrides,
  };
}
