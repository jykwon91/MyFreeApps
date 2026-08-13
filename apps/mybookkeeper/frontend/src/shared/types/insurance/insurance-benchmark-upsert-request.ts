/**
 * Body for ``PUT /insurance-benchmarks``.
 *
 * Mirrors ``schemas/insurance/insurance_benchmark_upsert_request.py``. Both
 * figures are required: a premium without the coverage it buys cannot be
 * normalised, and a benchmark that cannot be normalised never matches anything.
 */
export interface InsuranceBenchmarkUpsertRequest {
  annual_premium_cents: number;
  coverage_amount_cents: number;
  region_label?: string | null;
  source?: string | null;
  observed_on: string;
  notes?: string | null;
}
