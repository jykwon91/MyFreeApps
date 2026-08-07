import { Trash2 } from "lucide-react";
import {
  formatCentsPerKwh,
  formatPlanDate,
  formatRenewalCountdown,
} from "@/shared/lib/utility-plan-format";
import { UTILITY_PLAN_RATE_TYPE_LABELS } from "@/shared/types/utility/utility-plan-rate-type";
import { UTILITY_SERVICE_TYPE_LABELS } from "@/shared/types/utility/utility-service-type";
import type { UtilityPlanSummary } from "@/shared/types/utility/utility-plan-summary";
import UtilityPlanRenewalBadge from "./UtilityPlanRenewalBadge";

export interface UtilityPlanRowProps {
  plan: UtilityPlanSummary;
  isDeleting: boolean;
  onDelete: (plan: UtilityPlanSummary) => void;
}

export default function UtilityPlanRow({ plan, isDeleting, onDelete }: UtilityPlanRowProps) {
  return (
    <li
      className="border rounded-lg px-4 py-3 text-sm"
      data-testid={`utility-plan-item-${plan.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium truncate">
            {plan.property_name ?? "Unknown property"}
            <span className="text-muted-foreground font-normal">
              {" · "}
              {UTILITY_SERVICE_TYPE_LABELS[plan.service_type]}
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {plan.provider_name}
            {plan.plan_name ? ` — ${plan.plan_name}` : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {UTILITY_PLAN_RATE_TYPE_LABELS[plan.rate_type]}
            {plan.avg_price_cents_per_kwh_at_1000
              ? ` · ${formatCentsPerKwh(plan.avg_price_cents_per_kwh_at_1000)} at 1,000 kWh`
              : ""}
          </p>
          {plan.term_end_date ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              Term ends {formatPlanDate(plan.term_end_date)} ·{" "}
              {formatRenewalCountdown(plan.days_until_term_end)}
            </p>
          ) : null}
          {/* A superseded plan is kept as the baseline a new rate is measured
              against, so it stays visible — but it must not read as live. */}
          {plan.is_current ? null : (
            <p className="text-xs text-muted-foreground mt-0.5 italic">
              Superseded — kept for rate history
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <UtilityPlanRenewalBadge status={plan.renewal_status} />
          <button
            type="button"
            onClick={() => onDelete(plan)}
            disabled={isDeleting}
            aria-label={`Delete ${plan.provider_name} plan`}
            className="text-muted-foreground hover:text-red-600 disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
            data-testid={`utility-plan-delete-${plan.id}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </li>
  );
}
