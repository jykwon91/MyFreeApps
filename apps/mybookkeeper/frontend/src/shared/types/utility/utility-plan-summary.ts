import type { UtilityPlanRateType } from "@/shared/types/utility/utility-plan-rate-type";
import type { UtilityPlanRenewalStatus } from "@/shared/types/utility/utility-plan-renewal-status";
import type { UtilityServiceType } from "@/shared/types/utility/utility-service-type";

/**
 * Summary row for the utility-plan list.
 *
 * Mirrors ``schemas/properties/utility_plan_summary.py``.
 *
 * Rate columns are ``Numeric`` on the backend and serialize as JSON *strings*
 * (``"13.9000"``), not numbers — parse before doing arithmetic.
 */
export interface UtilityPlanSummary {
  id: string;
  property_id: string;
  property_name: string | null;
  service_type: UtilityServiceType;
  provider_name: string;
  plan_name: string | null;
  rate_type: UtilityPlanRateType;
  avg_price_cents_per_kwh_at_1000: string | null;
  term_end_date: string | null;
  /** Negative once the term has lapsed, which is the case worth seeing. */
  days_until_term_end: number | null;
  renewal_status: UtilityPlanRenewalStatus;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}
