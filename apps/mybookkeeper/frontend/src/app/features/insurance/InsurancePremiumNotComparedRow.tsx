import { INSURANCE_BENCHMARK_STATUS_LABELS } from "@/shared/types/insurance/insurance-benchmark-status";
import type { InsurancePremiumComparisonRow as ComparisonRow } from "@/shared/types/insurance/insurance-premium-comparison-row";

export interface InsurancePremiumNotComparedRowProps {
  row: ComparisonRow;
}

/**
 * One policy the comparison could not measure, and why.
 *
 * Shown rather than dropped: "nothing was flagged" and "nothing was checked"
 * look identical from the outside, and only one of them is good news.
 */
export default function InsurancePremiumNotComparedRow({
  row,
}: InsurancePremiumNotComparedRowProps) {
  const { policy } = row;
  return (
    <li
      className="flex items-start justify-between gap-3 py-2"
      data-testid={`insurance-premium-not-compared-${policy.id}`}
    >
      <div className="min-w-0">
        <p className="text-sm truncate">
          {policy.policy_name}
          {policy.carrier ? (
            <span className="text-muted-foreground">
              {" · "}
              {policy.carrier}
            </span>
          ) : null}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {INSURANCE_BENCHMARK_STATUS_LABELS[row.status]}
      </span>
    </li>
  );
}
