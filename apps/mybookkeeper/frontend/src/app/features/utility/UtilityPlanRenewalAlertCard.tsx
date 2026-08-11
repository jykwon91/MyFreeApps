import { Link } from "react-router-dom";
import AlertBox from "@/shared/components/ui/AlertBox";
import Card from "@/shared/components/ui/Card";
import { useGetUtilityPlanRenewalAlertsQuery } from "@/shared/store/utilityPlansApi";
import UtilityPlanAlertRow from "./UtilityPlanAlertRow";
import UtilityPlanAlertCardSkeleton from "./UtilityPlanAlertCardSkeleton";
import { useHasAnyUtilityPlans } from "./useHasAnyUtilityPlans";
import { useUtilityPlanAlertCardMode } from "./useUtilityPlanAlertCardMode";

/**
 * Dashboard card for utility plans whose fixed term has lapsed or is about to.
 *
 * Fetches its own data so the dashboard only has to place it. Expired plans
 * lead: an expired term means the account has almost certainly rolled onto a
 * holdover variable rate and is already costing money, whereas an
 * expiring-soon one is still just a deadline.
 */
export default function UtilityPlanRenewalAlertCard() {
  const { data, isLoading, isError, refetch, isFetching } =
    useGetUtilityPlanRenewalAlertsQuery();
  // The card hides itself for operators who track no plans at all.
  const {
    hasAnyPlans,
    isLoading: isPlansLoading,
    isError: isPlansError,
  } = useHasAnyUtilityPlans();

  const mode = useUtilityPlanAlertCardMode({
    isLoading: isLoading || isPlansLoading,
    isError: isError || isPlansError,
    totalNeedingAttention: data?.total_needing_attention,
    hasAnyPlans,
  });

  if (mode === "loading") return <UtilityPlanAlertCardSkeleton />;
  if (mode === "hidden") return null;

  if (mode === "error") {
    return (
      <AlertBox variant="error" className="flex items-center justify-between gap-3">
        <span>Couldn't check utility plan renewals.</span>
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

  if (mode === "clear") {
    return (
      <Card title="Utility plans" className="text-sm text-muted-foreground">
        <p data-testid="utility-plan-alert-card-clear">
          No utility plans need renewing in the next {data?.window_days ?? 45} days.
        </p>
      </Card>
    );
  }

  const expired = data?.expired ?? [];
  const expiringSoon = data?.expiring_soon ?? [];

  return (
    <Card className="p-0 overflow-hidden">
      <div
        className="flex items-center justify-between gap-3 px-6 py-4 border-b"
        data-testid="utility-plan-alert-card"
      >
        <h2 className="text-base font-medium">
          Utility plans needing renewal ({data?.total_needing_attention ?? 0})
        </h2>
        <Link
          to="/utility-plans"
          className="text-sm font-medium text-primary hover:underline shrink-0"
        >
          View all
        </Link>
      </div>

      <div className="px-6 py-2">
        {expired.length > 0 ? (
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-2">
              Already lapsed — likely on a holdover rate
            </h3>
            <ul className="divide-y">
              {expired.map((plan) => (
                <UtilityPlanAlertRow key={plan.id} plan={plan} />
              ))}
            </ul>
          </section>
        ) : null}

        {expiringSoon.length > 0 ? (
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-2">
              Expiring within {data?.window_days ?? 45} days
            </h3>
            <ul className="divide-y">
              {expiringSoon.map((plan) => (
                <UtilityPlanAlertRow key={plan.id} plan={plan} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Card>
  );
}
