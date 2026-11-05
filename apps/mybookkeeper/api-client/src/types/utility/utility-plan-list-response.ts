import type { UtilityPlanSummary } from "./utility-plan-summary";

/**
 * Paginated list response for utility plans.
 *
 * Mirrors ``schemas/properties/utility_plan_list_response.py``.
 */
export interface UtilityPlanListResponse {
  items: UtilityPlanSummary[];
  total: number;
  has_more: boolean;
}
