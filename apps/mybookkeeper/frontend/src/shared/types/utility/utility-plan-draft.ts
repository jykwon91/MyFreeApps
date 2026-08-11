/**
 * A plan as read from a document — the response of ``POST /utility-plans/extract``.
 *
 * Mirrors ``schemas/properties/utility_plan_draft.py``. Deliberately NOT a
 * ``UtilityPlanCreateRequest``: every field is optional (including the ones a
 * real plan requires) because a document that never names its provider should
 * still hand back the eleven fields it did state, and ``service_type`` /
 * ``rate_type`` are plain strings rather than the unions because the backend
 * only guarantees it dropped values outside them — it does not guarantee it
 * found one.
 *
 * Rate fields arrive as strings, like every other rate on the wire, so 5.3509
 * survives the JSON boundary intact.
 */
export interface UtilityPlanDraft {
  source_document_id: string;

  service_type: string | null;
  provider_name: string | null;
  plan_name: string | null;
  account_number: string | null;
  rate_type: string | null;

  energy_charge_cents_per_kwh: string | null;
  tdu_charge_cents_per_kwh: string | null;
  avg_price_cents_per_kwh_at_1000: string | null;
  monthly_base_charge_cents: number | null;

  term_months: number | null;
  service_start_date: string | null;
  term_end_date: string | null;
  early_termination_fee_cents: number | null;

  has_bill_credit: boolean;
  bill_credit_amount_cents: number | null;
  bill_credit_threshold_kwh: number | null;
  min_usage_fee_cents: number | null;
  min_usage_threshold_kwh: number | null;

  post_promo_monthly_cents: number | null;
  equipment_fee_monthly_cents: number | null;
  download_mbps: number | null;
  upload_mbps: number | null;
  data_cap_gb: number | null;

  notes: string | null;

  /** How much of this came off the page rather than out of interpretation. */
  confidence: string;

  /** Reasons to distrust a specific field, e.g. a TDU rate from a stale EFL. */
  warnings: string[];

  /** Real terms the schema has no column for. */
  unrepresented: string[];
}
