import type { UtilityPlanSummary } from "@mybookkeeper/api-client/types/utility/utility-plan-summary";
import { UTILITY_SERVICE_TYPE_LABELS } from "@mybookkeeper/api-client/constants/utilityServiceTypes";
import { UTILITY_PLAN_MESSAGES as MESSAGES } from "../../constants/utilityPlans";
import type { UtilityPlanFilter } from "../../types/UtilityPlanFilter";
import { renewalStatusOn } from "./utilityPlanDisplay";

export const NO_UTILITY_PLAN_FILTER: UtilityPlanFilter = { needsRenewing: false, serviceType: null };

export function isNarrowed(filter: UtilityPlanFilter): boolean {
  return filter.needsRenewing || filter.serviceType !== null;
}

/**
 * Filtered here rather than by the server's date filter: what "needs renewing" means is the
 * derived status, which already accounts for rate type, since a regulated plan has no renewal to act on.
 */
export function filteredPlans(plans: readonly UtilityPlanSummary[], filter: UtilityPlanFilter, todayIso: string): UtilityPlanSummary[] {
  return plans.filter((plan) => {
    if (filter.serviceType && plan.service_type !== filter.serviceType) return false;
    if (!filter.needsRenewing) return true;
    const status = renewalStatusOn(plan, todayIso);
    return plan.is_current && (status === "expired" || status === "expiring_soon");
  });
}

/** What the filter button says: what's narrowing the list, or an invitation to narrow it. */
export function filterLabel(filter: UtilityPlanFilter): string {
  const parts = [filter.needsRenewing ? MESSAGES.filterRenewingShort : null, filter.serviceType ? UTILITY_SERVICE_TYPE_LABELS[filter.serviceType] : null].filter(Boolean);
  return parts.length > 0 ? `${MESSAGES.filterButton}: ${parts.join(", ")}` : MESSAGES.filterButton;
}
