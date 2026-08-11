import { UTILITY_PLAN_BENCHMARK_STATUS_LABELS } from "@/shared/types/utility/utility-plan-benchmark-status";
import { UTILITY_SERVICE_TYPE_LABELS } from "@/shared/types/utility/utility-service-type";
import type { UtilityPlanRateComparisonRow } from "@/shared/types/utility/utility-plan-rate-comparison-row";

export interface UtilityPlanNotComparedRowProps {
  row: UtilityPlanRateComparisonRow;
}

/**
 * One plan the comparison could not measure, and why.
 *
 * Shown rather than dropped: "nothing was flagged" and "nothing was checked"
 * look identical from the outside, and only one of them is good news.
 */
export default function UtilityPlanNotComparedRow({
  row,
}: UtilityPlanNotComparedRowProps) {
  const { plan } = row;
  return (
    <li
      className="flex items-start justify-between gap-3 py-2"
      data-testid={`utility-plan-not-compared-${plan.id}`}
    >
      <div className="min-w-0">
        <p className="text-sm truncate">
          {plan.property_name ?? "Unknown property"}
          <span className="text-muted-foreground">
            {" · "}
            {UTILITY_SERVICE_TYPE_LABELS[plan.service_type]}
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {plan.provider_name}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {UTILITY_PLAN_BENCHMARK_STATUS_LABELS[row.status]}
      </span>
    </li>
  );
}
