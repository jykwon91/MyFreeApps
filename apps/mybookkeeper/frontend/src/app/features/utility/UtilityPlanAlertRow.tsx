import { formatPlanDate, formatRenewalCountdown } from "@/shared/lib/utility-plan-format";
import { UTILITY_SERVICE_TYPE_LABELS } from "@/shared/types/utility/utility-service-type";
import type { UtilityPlanSummary } from "@/shared/types/utility/utility-plan-summary";
import UtilityPlanRenewalBadge from "./UtilityPlanRenewalBadge";

export interface UtilityPlanAlertRowProps {
  plan: UtilityPlanSummary;
}

export default function UtilityPlanAlertRow({ plan }: UtilityPlanAlertRowProps) {
  return (
    <li
      className="flex items-start justify-between gap-3 py-2"
      data-testid={`utility-plan-alert-${plan.id}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {plan.property_name ?? "Unknown property"}
          <span className="text-muted-foreground font-normal">
            {" · "}
            {UTILITY_SERVICE_TYPE_LABELS[plan.service_type]}
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {plan.provider_name} · {formatRenewalCountdown(plan.days_until_term_end)} (
          {formatPlanDate(plan.term_end_date)})
        </p>
      </div>
      <UtilityPlanRenewalBadge status={plan.renewal_status} />
    </li>
  );
}
