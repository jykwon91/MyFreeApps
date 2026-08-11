import type { UtilityServiceType } from "@/shared/types/utility/utility-service-type";

/**
 * One recorded market observation.
 *
 * Mirrors ``schemas/properties/market_rate_benchmark_response.py``. Exactly one
 * of ``rate_cents_per_kwh`` (metered service) and ``monthly_cents`` (flat
 * service) is set — the database enforces that, so the UI can branch on which
 * is non-null rather than on the service type.
 *
 * Decimal fields arrive as strings: JSON numbers are IEEE doubles, and a rate
 * carrying four decimals should not be rounded in transit.
 */
export interface MarketRateBenchmark {
  id: string;
  service_type: UtilityServiceType;
  rate_cents_per_kwh: string | null;
  monthly_cents: number | null;
  source: string | null;
  observed_on: string;
  notes: string | null;
  /** Derived server-side from ``observed_on`` — never stored. */
  is_stale: boolean;
  created_at: string;
  updated_at: string;
}
