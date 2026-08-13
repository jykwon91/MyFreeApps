import { format, parseISO } from "date-fns";
import {
  formatAnnualPremium,
  formatCoverageRate,
  formatPolicyMoney,
} from "@/shared/lib/insurance-policy-format";
import { useGetInsuranceBenchmarkQuery } from "@/shared/store/insuranceBenchmarksApi";

export interface InsuranceBenchmarkSummaryProps {
  onEdit: () => void;
}

/**
 * The market premium the policies on this page are measured against.
 *
 * Shown here rather than only in the dialog so the number driving the
 * above-market flag is visible next to the policies it judges — a benchmark the
 * operator cannot see is one they cannot tell has gone stale.
 */
export default function InsuranceBenchmarkSummary({
  onEdit,
}: InsuranceBenchmarkSummaryProps) {
  const { data: benchmark, isLoading } = useGetInsuranceBenchmarkQuery();

  if (isLoading) {
    return (
      <div
        className="h-9 bg-muted rounded animate-pulse"
        aria-busy="true"
        data-testid="insurance-benchmark-summary-loading"
      />
    );
  }

  if (!benchmark) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="insurance-benchmark-summary-empty"
      >
        No market premium recorded, so no policy is being checked for overpaying.{" "}
        <button
          type="button"
          onClick={onEdit}
          className="font-medium text-primary hover:underline"
          data-testid="insurance-benchmark-summary-record"
        >
          Record one
        </button>
        .
      </p>
    );
  }

  return (
    <div
      className="text-sm text-muted-foreground space-y-1"
      data-testid="insurance-benchmark-summary"
    >
      <p className="font-medium text-foreground">Comparing against</p>
      <p data-testid="insurance-benchmark-summary-figure">
        {formatAnnualPremium(benchmark.annual_premium_cents)} on{" "}
        {formatPolicyMoney(benchmark.coverage_amount_cents)} of dwelling coverage —{" "}
        {formatCoverageRate(benchmark.rate_cents_per_1000_coverage)}
      </p>
      <p>
        {benchmark.region_label ? `${benchmark.region_label} · ` : ""}
        {benchmark.source ? `${benchmark.source} · ` : ""}seen{" "}
        {format(parseISO(benchmark.observed_on), "MMM d, yyyy")}
        {benchmark.is_stale ? (
          <span
            className="ml-1 text-amber-700 dark:text-amber-400"
            data-testid="insurance-benchmark-summary-stale"
          >
            (worth rechecking)
          </span>
        ) : null}
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="font-medium text-primary hover:underline"
        data-testid="insurance-benchmark-summary-edit"
      >
        Update market premium
      </button>
    </div>
  );
}
