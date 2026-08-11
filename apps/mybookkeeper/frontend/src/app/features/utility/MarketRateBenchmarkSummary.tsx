import {
  formatCents,
  formatCentsPerKwh,
  formatPlanDate,
} from "@/shared/lib/utility-plan-format";
import { useGetMarketRateBenchmarksQuery } from "@/shared/store/marketRateBenchmarksApi";
import { UTILITY_SERVICE_TYPE_LABELS } from "@/shared/types/utility/utility-service-type";
import type { MarketRateBenchmark } from "@/shared/types/utility/market-rate-benchmark";

export interface MarketRateBenchmarkSummaryProps {
  onEdit: () => void;
}

/**
 * Read from the column the service type is priced in, not from whichever one
 * happens to be populated — the comparison picks its figure the same way, and
 * two sides disagreeing about the unit is how a monthly amount ends up being
 * displayed as a per-kWh rate.
 */
function describeFigure(benchmark: MarketRateBenchmark): string {
  if (benchmark.service_type === "internet") {
    return benchmark.monthly_cents === null
      ? "—"
      : `${formatCents(benchmark.monthly_cents)}/mo`;
  }
  return formatCentsPerKwh(benchmark.rate_cents_per_kwh);
}

/**
 * The market rates the plans on this page are measured against.
 *
 * Shown here rather than only in the dialog so the number driving the
 * above-market badge is visible next to the plans it judges — a benchmark the
 * operator cannot see is one they cannot tell has gone stale.
 */
export default function MarketRateBenchmarkSummary({
  onEdit,
}: MarketRateBenchmarkSummaryProps) {
  const { data, isLoading } = useGetMarketRateBenchmarksQuery();

  if (isLoading) {
    return (
      <div
        className="h-9 bg-muted rounded animate-pulse"
        aria-busy="true"
        data-testid="market-rate-benchmark-summary-loading"
      />
    );
  }

  const benchmarks = data ?? [];

  if (benchmarks.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="market-rate-benchmark-summary-empty"
      >
        No market rate recorded, so no plan is being checked for overpaying.{" "}
        <button
          type="button"
          onClick={onEdit}
          className="font-medium text-primary hover:underline"
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
      data-testid="market-rate-benchmark-summary"
    >
      <p className="font-medium text-foreground">Comparing against</p>
      <ul className="space-y-0.5">
        {benchmarks.map((benchmark) => (
          <li key={benchmark.id} data-testid={`market-rate-${benchmark.service_type}`}>
            {UTILITY_SERVICE_TYPE_LABELS[benchmark.service_type]}:{" "}
            {describeFigure(benchmark)}
            {benchmark.source ? ` · ${benchmark.source}` : ""} · seen{" "}
            {formatPlanDate(benchmark.observed_on)}
            {benchmark.is_stale ? (
              <span className="ml-1 text-amber-700 dark:text-amber-400">
                (worth rechecking)
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onEdit}
        className="font-medium text-primary hover:underline"
        data-testid="market-rate-benchmark-summary-edit"
      >
        Update market rates
      </button>
    </div>
  );
}
