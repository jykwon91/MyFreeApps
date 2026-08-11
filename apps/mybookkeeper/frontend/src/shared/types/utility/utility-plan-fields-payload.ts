import type { UtilityPlanRateType } from "@/shared/types/utility/utility-plan-rate-type";
import type { UtilityServiceType } from "@/shared/types/utility/utility-service-type";

/**
 * The plan fields the form edits, in API shape.
 *
 * This is the intersection of ``UtilityPlanCreateRequest`` and
 * ``UtilityPlanUpdateRequest``: adding ``property_id`` makes it a create body,
 * and it is assignable to an update body as is.
 *
 * ``notes`` is deliberately absent. The form does not edit it and ``PATCH``
 * applies exactly the keys it is sent, so including it would erase the
 * provenance note a seeded plan records.
 */
export interface UtilityPlanFieldsPayload {
  service_type: UtilityServiceType;
  rate_type: UtilityPlanRateType;
  provider_name: string;
  plan_name: string | null;
  account_number: string | null;

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
}
