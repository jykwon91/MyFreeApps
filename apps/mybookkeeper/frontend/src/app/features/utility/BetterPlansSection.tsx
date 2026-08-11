import { LoadingButton } from "@platform/ui";
import BetterPlansBody from "@/app/features/utility/BetterPlansBody";
import { useBetterPlansMode } from "@/app/features/utility/useBetterPlansMode";
import { useLazyFindBetterUtilityPlansQuery } from "@/shared/store/utilityOffersApi";

/**
 * "Find a better plan" — the market side of the utility feature.
 *
 * The search is explicit rather than automatic: it fans out to the Power to
 * Choose feed once per distinct property ZIP, and a page view is not a reason
 * to hit an external service.
 */
export default function BetterPlansSection() {
  const [search, { data, isFetching, isError, isUninitialized }] =
    useLazyFindBetterUtilityPlansQuery();

  const groups = data?.groups ?? [];
  const mode = useBetterPlansMode({
    hasSearched: !isUninitialized,
    isFetching,
    isError,
    groupCount: groups.length,
  });

  return (
    <section className="space-y-3" data-testid="better-plans-section">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Find a better plan</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live offers from Power to Choose, the marketplace the Public Utility
            Commission of Texas runs.
          </p>
        </div>
        <LoadingButton
          isLoading={isFetching}
          loadingText="Checking the market..."
          onClick={() => void search({})}
          data-testid="find-better-plans-button"
        >
          Check the market
        </LoadingButton>
      </div>

      <BetterPlansBody
        mode={mode}
        groups={groups}
        referenceAnnualKwh={data?.reference_annual_kwh ?? 0}
      />
    </section>
  );
}
