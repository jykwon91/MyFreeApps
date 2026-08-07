import {
  UTILITY_PLAN_RENEWAL_STATUS_CLASSES,
  UTILITY_PLAN_RENEWAL_STATUS_LABELS,
} from "@/shared/types/utility/utility-plan-renewal-status";
import type { UtilityPlanRenewalStatus } from "@/shared/types/utility/utility-plan-renewal-status";

export interface UtilityPlanRenewalBadgeProps {
  status: UtilityPlanRenewalStatus;
}

/**
 * Renewal-status pill. The status is computed by the backend from the term end
 * date and today — never recomputed here, so the badge cannot disagree with
 * the alert that put the plan on the dashboard.
 */
export default function UtilityPlanRenewalBadge({ status }: UtilityPlanRenewalBadgeProps) {
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${UTILITY_PLAN_RENEWAL_STATUS_CLASSES[status]}`}
      data-testid={`utility-plan-status-${status}`}
    >
      {UTILITY_PLAN_RENEWAL_STATUS_LABELS[status]}
    </span>
  );
}
