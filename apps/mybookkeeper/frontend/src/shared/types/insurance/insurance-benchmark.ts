/**
 * The organization's recorded market observation for property insurance.
 *
 * Mirrors ``schemas/insurance/insurance_benchmark_response.py``. One per
 * organization — a singleton, so there is no id in the routes that write it.
 *
 * ``rate_cents_per_1000_coverage`` arrives as a string: it is a Decimal on the
 * backend, and JSON numbers are IEEE doubles.
 */
export interface InsuranceBenchmark {
  id: string;
  annual_premium_cents: number;
  coverage_amount_cents: number;
  region_label: string | null;
  source: string | null;
  observed_on: string;
  notes: string | null;
  /** Cents of annual premium per $1,000 of dwelling coverage. Derived. */
  rate_cents_per_1000_coverage: string | null;
  /** Derived server-side from ``observed_on`` — never stored. */
  is_stale: boolean;
  created_at: string;
  updated_at: string;
}
