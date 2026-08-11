/**
 * Body for ``PUT /market-rate-benchmarks/{service_type}``.
 *
 * Mirrors ``schemas/properties/market_rate_benchmark_upsert_request.py``.
 * Exactly one of the two figures must be sent; the backend rejects both or
 * neither with a 422.
 */
export interface MarketRateBenchmarkUpsertRequest {
  rate_cents_per_kwh?: string | null;
  monthly_cents?: number | null;
  source?: string | null;
  observed_on: string;
  notes?: string | null;
}
