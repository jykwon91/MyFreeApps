import type { UtilityPlanRateType } from "@/shared/types/utility/utility-plan-rate-type";
import type { UtilityPlanRenewalStatus } from "@/shared/types/utility/utility-plan-renewal-status";
import type { UtilityServiceType } from "@/shared/types/utility/utility-service-type";

/**
 * A single utility plan in full.
 *
 * Mirrors ``schemas/properties/utility_plan_response.py``. Rate fields are
 * JSON strings (see ``UtilityPlanSummary``); flat money is integer cents.
 */
export interface UtilityPlanDetail {
  id: string;
  user_id: string;
  organization_id: string;
  property_id: string;
  property_name: string | null;

  service_type: UtilityServiceType;
  provider_name: string;
  account_number: string | null;
  plan_name: string | null;
  rate_type: UtilityPlanRateType;

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

  source_document_id: string | null;

  notes: string | null;

  days_until_term_end: number | null;
  renewal_status: UtilityPlanRenewalStatus;
  is_current: boolean;

  created_at: string;
  updated_at: string;
}
