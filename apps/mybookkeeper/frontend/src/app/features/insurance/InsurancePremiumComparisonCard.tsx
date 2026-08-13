import { Link } from "react-router-dom";
import AlertBox from "@/shared/components/ui/AlertBox";
import Card from "@/shared/components/ui/Card";
import { useGetInsurancePremiumComparisonQuery } from "@/shared/store/insuranceBenchmarksApi";
import InsurancePremiumComparisonRow from "./InsurancePremiumComparisonRow";
import InsurancePremiumComparisonCardSkeleton from "./InsurancePremiumComparisonCardSkeleton";
import InsurancePremiumNotComparedRow from "./InsurancePremiumNotComparedRow";
import { useInsuranceComparisonCardMode } from "./useInsuranceComparisonCardMode";
import { INSURANCE_COMPARISON_CARD_MODES } from "@/shared/types/insurance/insurance-comparison-card-mode";

/**
 * Dashboard card for policies priced materially above the recorded market
 * premium.
 *
 * The sibling expiration badge answers "is a policy about to lapse?". This one
 * answers the question that badge cannot: a policy can be years from expiry and
 * still cost half again what the same coverage sells for, and nothing in the
 * app would have said so — insurance renews itself quietly at whatever the
 * carrier decides.
 *
 * Every branch that reports good news also reports what that news rests on —
 * the staleness caveat and the not-checked list render in the all-clear case
 * too, because "no policy is above market" is only worth reading alongside how
 * many were actually measured and how old the yardstick is.
 */
export default function InsurancePremiumComparisonCard() {
  const { data, isLoading, isError, refetch, isFetching } =
    useGetInsurancePremiumComparisonQuery();

  const mode = useInsuranceComparisonCardMode({
    isLoading,
    isError,
    totalAboveMarket: data?.total_above_market,
    hasAnyPolicies: (data?.total_considered ?? 0) > 0,
    hasBenchmark: data?.benchmark != null,
  });

  if (mode === INSURANCE_COMPARISON_CARD_MODES.LOADING) {
    return <InsurancePremiumComparisonCardSkeleton />;
  }
  if (mode === INSURANCE_COMPARISON_CARD_MODES.HIDDEN) return null;

  if (mode === INSURANCE_COMPARISON_CARD_MODES.ERROR) {
    return (
      <AlertBox variant="error" className="flex items-center justify-between gap-3">
        <span>Couldn't compare your insurance premiums to the market.</span>
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

  if (mode === INSURANCE_COMPARISON_CARD_MODES.NO_BENCHMARK) {
    return (
      <Card title="Premium check" className="text-sm text-muted-foreground">
        <p data-testid="insurance-premium-comparison-card-no-benchmark">
          No market premium recorded yet, so nothing is being checked against
          your policies.{" "}
          <Link to="/insurance-policies" className="font-medium text-primary hover:underline">
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

  const isClear = mode === INSURANCE_COMPARISON_CARD_MODES.CLEAR;

  return (
    <Card className="p-0 overflow-hidden">
      <div
        className="flex items-center justify-between gap-3 px-6 py-4 border-b"
        data-testid="insurance-premium-comparison-card"
      >
        <h2 className="text-base font-medium">
          {isClear
            ? "Premium check"
            : `Paying above market (${data.total_above_market})`}
        </h2>
        <Link
          to="/insurance-policies"
          className="text-sm font-medium text-primary hover:underline shrink-0"
        >
          View all
        </Link>
      </div>

      <div className="px-6 py-2">
        {isClear ? (
          <p
            className="text-sm text-muted-foreground py-2"
            data-testid="insurance-premium-comparison-card-clear"
          >
            No policy costs more than {data.material_gap_pct}% above the market
            premium you recorded, per $1,000 of coverage.
          </p>
        ) : (
          <ul className="divide-y" data-testid="insurance-premium-comparison-above-list">
            {data.above_market.map((row) => (
              <InsurancePremiumComparisonRow key={row.policy.id} row={row} />
            ))}
          </ul>
        )}

        {data.has_stale_benchmark ? (
          <p
            className="text-xs text-muted-foreground py-2"
            data-testid="insurance-premium-comparison-stale-notice"
          >
            {isClear
              ? "This rests on a market premium recorded a while ago — worth checking again."
              : "These use a market premium recorded a while ago — worth checking again before acting on it."}
          </p>
        ) : null}

        {data.not_compared.length > 0 ? (
          <div
            className="border-t pt-2 mt-1"
            data-testid="insurance-premium-comparison-not-compared"
          >
            <p className="text-xs font-medium text-muted-foreground py-1">
              Not checked ({data.not_compared.length})
            </p>
            <ul className="divide-y">
              {data.not_compared.map((row) => (
                <InsurancePremiumNotComparedRow key={row.policy.id} row={row} />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
