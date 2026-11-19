import type { UtilityPlanPageArgs } from "@mybookkeeper/api-client/types/utility/utility-plan-page-args";
import { UTILITY_SERVICE_TYPE_LABELS } from "@mybookkeeper/api-client/constants/utilityServiceTypes";
import { UTILITY_PLAN_MESSAGES as MESSAGES } from "../../constants/utilityPlans";
import type { UtilityPlanFilter } from "../../types/UtilityPlanFilter";

export const NO_UTILITY_PLAN_FILTER: UtilityPlanFilter = { needsRenewing: false, serviceType: null };

export function isNarrowed(filter: UtilityPlanFilter): boolean {
  return filter.needsRenewing || filter.serviceType !== null;
}

/**
 * What the server is asked for. The server narrows the whole list, not just the pages loaded so far, and
 * "needs renewing" is the derived status (a regulated plan has no renewal to act on), which it owns.
 */
export function pageArgsFor(filter: UtilityPlanFilter): UtilityPlanPageArgs {
  return {
    ...(filter.serviceType ? { service_type: filter.serviceType } : {}),
    ...(filter.needsRenewing ? { needs_renewal: true } : {}),
  };
}

/** What the filter button says: what's narrowing the list, or an invitation to narrow it. */
export function filterLabel(filter: UtilityPlanFilter): string {
  const parts = [filter.needsRenewing ? MESSAGES.filterRenewingShort : null, filter.serviceType ? UTILITY_SERVICE_TYPE_LABELS[filter.serviceType] : null].filter(Boolean);
  return parts.length > 0 ? `${MESSAGES.filterButton}: ${parts.join(", ")}` : MESSAGES.filterButton;
}
