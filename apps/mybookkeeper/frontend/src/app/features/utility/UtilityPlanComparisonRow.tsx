import { formatBenchmarkGap } from "@/shared/lib/benchmark-format";
import { formatComparisonFigure } from "@/shared/lib/utility-plan-format";
import { UTILITY_SERVICE_TYPE_LABELS } from "@/shared/types/utility/utility-service-type";
import type { UtilityPlanRateComparisonRow } from "@/shared/types/utility/utility-plan-rate-comparison-row";

export interface UtilityPlanComparisonRowProps {
  row: UtilityPlanRateComparisonRow;
}

export default function UtilityPlanComparisonRow({ row }: UtilityPlanComparisonRowProps) {
  const { plan } = row;
  return (
    <li
      className="flex items-start justify-between gap-3 py-2"
      data-testid={`utility-plan-comparison-${plan.id}`}
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
          {plan.provider_name} · paying{" "}
          {formatComparisonFigure(row.plan_figure, plan.service_type)} vs market{" "}
          {formatComparisonFigure(row.benchmark_figure, plan.service_type)}
          {/* Per-row rather than only card-level: with several services
              benchmarked, the operator needs to know which of them is the
              one resting on an old observation. */}
          {row.benchmark_is_stale ? (
            <span data-testid={`utility-plan-comparison-stale-${plan.id}`}>
              {" "}
              (recorded a while ago)
            </span>
          ) : null}
        </p>
      </div>
      <span
        className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
        data-testid={`utility-plan-comparison-gap-${plan.id}`}
      >
        {formatBenchmarkGap(row.gap_pct)}
      </span>
    </li>
  );
}
