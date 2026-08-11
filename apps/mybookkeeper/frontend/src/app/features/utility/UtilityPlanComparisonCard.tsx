import { Link } from "react-router-dom";
import AlertBox from "@/shared/components/ui/AlertBox";
import Card from "@/shared/components/ui/Card";
import {
  useGetMarketRateBenchmarksQuery,
  useGetUtilityPlanRateComparisonQuery,
} from "@/shared/store/marketRateBenchmarksApi";
import UtilityPlanComparisonRow from "./UtilityPlanComparisonRow";
import UtilityPlanComparisonCardSkeleton from "./UtilityPlanComparisonCardSkeleton";
import UtilityPlanNotComparedRow from "./UtilityPlanNotComparedRow";
import { useHasAnyUtilityPlans } from "./useHasAnyUtilityPlans";
import { useUtilityPlanComparisonCardMode } from "./useUtilityPlanComparisonCardMode";

/**
 * Dashboard card for plans priced materially above the recorded market rate.
 *
 * The sibling renewal card answers "is a term about to lapse?". This one
 * answers the question that card cannot: a plan can be comfortably inside its
 * term and still be the most expensive line in the portfolio, and nothing in
 * the app would have said so.
 *
 * Every branch that reports good news also reports what that news rests on —
 * the staleness caveat and the not-checked list render in the all-clear case
 * too, because "no plan is above market" is only worth reading alongside how
 * many plans were actually measured and how old the yardstick is.
 */
export default function UtilityPlanComparisonCard() {
  const { data, isLoading, isError, refetch, isFetching } =
    useGetUtilityPlanRateComparisonQuery();
  const {
    data: benchmarks,
    isLoading: isBenchmarksLoading,
    isError: isBenchmarksError,
  } = useGetMarketRateBenchmarksQuery();
  const {
    hasAnyPlans,
    isLoading: isPlansLoading,
    isError: isPlansError,
  } = useHasAnyUtilityPlans();

  const mode = useUtilityPlanComparisonCardMode({
    isLoading: isLoading || isPlansLoading || isBenchmarksLoading,
    // A failed benchmarks or plans query must not read as "none recorded" or
    // "none tracked" — both would render as a confident all-clear.
    isError: isError || isBenchmarksError || isPlansError,
    totalAboveMarket: data?.total_above_market,
    hasAnyPlans,
    hasAnyBenchmark: (benchmarks?.length ?? 0) > 0,
  });

  if (mode === "loading") return <UtilityPlanComparisonCardSkeleton />;
  if (mode === "hidden") return null;

  if (mode === "error") {
    return (
      <AlertBox variant="error" className="flex items-center justify-between gap-3">
        <span>Couldn't compare your utility rates to the market.</span>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-sm font-medium hover:underline"
        >
          {isFetching ? "Retrying..." : "Retry"}
        </button>
      </AlertBox>
    );
  }

  if (mode === "no-benchmark") {
    return (
      <Card title="Rate check" className="text-sm text-muted-foreground">
        <p data-testid="utility-plan-comparison-card-no-benchmark">
          No market rate recorded yet, so nothing is being checked against your
          plans.{" "}
          <Link to="/utility-plans" className="font-medium text-primary hover:underline">
            Record one
          </Link>{" "}
          to find out whether you are overpaying.
        </p>
      </Card>
    );
  }

  // Both remaining modes are reachable only once the comparison has resolved,
  // so the threshold below is read from the payload that owns it rather than
  // re-declared here with a fallback the UI would have no business choosing.
  if (!data) return null;

  const isClear = mode === "clear";

  return (
    <Card className="p-0 overflow-hidden">
      <div
        className="flex items-center justify-between gap-3 px-6 py-4 border-b"
        data-testid="utility-plan-comparison-card"
      >
        <h2 className="text-base font-medium">
          {isClear ? "Rate check" : `Paying above market (${data.total_above_market})`}
        </h2>
        <Link
          to="/utility-plans"
          className="text-sm font-medium text-primary hover:underline shrink-0"
        >
          View all
        </Link>
      </div>

      <div className="px-6 py-2">
        {isClear ? (
          <p
            className="text-sm text-muted-foreground py-2"
            data-testid="utility-plan-comparison-card-clear"
          >
            No plan is priced more than {data.material_gap_pct}% above the market
            rate you recorded.
          </p>
        ) : (
          <ul className="divide-y" data-testid="utility-plan-comparison-above-list">
            {data.above_market.map((row) => (
              <UtilityPlanComparisonRow key={row.plan.id} row={row} />
            ))}
          </ul>
        )}

        {data.has_stale_benchmark ? (
          <p
            className="text-xs text-muted-foreground py-2"
            data-testid="utility-plan-comparison-stale-notice"
          >
            {isClear
              ? "This rests on a market rate recorded a while ago — worth checking again."
              : "Some of these use a market rate recorded a while ago — worth checking again before acting on it."}
          </p>
        ) : null}

        {data.not_compared.length > 0 ? (
          <div
            className="border-t pt-2 mt-1"
            data-testid="utility-plan-comparison-not-compared"
          >
            <p className="text-xs font-medium text-muted-foreground py-1">
              Not checked ({data.not_compared.length})
            </p>
            <ul className="divide-y">
              {data.not_compared.map((row) => (
                <UtilityPlanNotComparedRow key={row.plan.id} row={row} />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
