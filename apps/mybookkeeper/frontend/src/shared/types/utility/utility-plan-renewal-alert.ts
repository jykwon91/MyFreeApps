import type { UtilityPlanSummary } from "@/shared/types/utility/utility-plan-summary";

/**
 * Dashboard payload for plans needing attention.
 *
 * Mirrors ``schemas/properties/utility_plan_renewal_alert_response.py``.
 * ``window_days`` is supplied by the backend so the UI can say "in the next N
 * days" without hardcoding a number it does not own.
 */
export interface UtilityPlanRenewalAlert {
  window_days: number;
  expired: UtilityPlanSummary[];
  expiring_soon: UtilityPlanSummary[];
  total_needing_attention: number;
}
