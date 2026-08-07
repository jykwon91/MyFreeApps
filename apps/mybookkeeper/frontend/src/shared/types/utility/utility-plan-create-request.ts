import type { UtilityPlanRateType } from "@/shared/types/utility/utility-plan-rate-type";
import type { UtilityServiceType } from "@/shared/types/utility/utility-service-type";

/**
 * Body for ``POST /utility-plans``.
 *
 * Mirrors ``schemas/properties/utility_plan_create_request.py``, which sets
 * ``extra="forbid"`` — an unknown key is a 422, not a silently dropped field.
 *
 * Rate fields are sent as strings so sub-cent precision survives the JSON
 * boundary: a TDU charge of 5.3509 ¢/kWh rounded to 5.35 by a float round-trip
 * would misprice every comparison built on it.
 */
export interface UtilityPlanCreateRequest {
  property_id: string;
  service_type: UtilityServiceType;
  provider_name: string;
  rate_type: UtilityPlanRateType;
  account_number?: string | null;
  plan_name?: string | null;

  energy_charge_cents_per_kwh?: string | null;
  tdu_charge_cents_per_kwh?: string | null;
  avg_price_cents_per_kwh_at_1000?: string | null;
  monthly_base_charge_cents?: number | null;

  term_months?: number | null;
  service_start_date?: string | null;
  term_end_date?: string | null;
  early_termination_fee_cents?: number | null;

  has_bill_credit?: boolean;
  bill_credit_amount_cents?: number | null;
  bill_credit_threshold_kwh?: number | null;
  min_usage_fee_cents?: number | null;
  min_usage_threshold_kwh?: number | null;

  notes?: string | null;
}
