import { formatBenchmarkGap } from "@/shared/lib/benchmark-format";
import { formatCoverageRate } from "@/shared/lib/insurance-policy-format";
import type { InsurancePremiumComparisonRow as ComparisonRow } from "@/shared/types/insurance/insurance-premium-comparison-row";

export interface InsurancePremiumComparisonRowProps {
  row: ComparisonRow;
}

export default function InsurancePremiumComparisonRow({
  row,
}: InsurancePremiumComparisonRowProps) {
  const { policy } = row;
  return (
    <li
      className="flex items-start justify-between gap-3 py-2"
      data-testid={`insurance-premium-comparison-${policy.id}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {policy.policy_name}
          {policy.carrier ? (
            <span className="text-muted-foreground font-normal">
              {" · "}
              {policy.carrier}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          paying {formatCoverageRate(row.policy_rate_cents_per_1000)} vs market{" "}
          {formatCoverageRate(row.benchmark_rate_cents_per_1000)}
          {row.benchmark_is_stale ? (
            <span data-testid={`insurance-premium-comparison-stale-${policy.id}`}>
              {" "}
              (recorded a while ago)
            </span>
          ) : null}
        </p>
      </div>
      <span
        className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
        data-testid={`insurance-premium-comparison-gap-${policy.id}`}
      >
        {formatBenchmarkGap(row.gap_pct)}
      </span>
    </li>
  );
}
