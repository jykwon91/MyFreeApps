import { LoadingButton } from "@platform/ui";
import { useLazyGetMortgageRateWatchQuery } from "@/shared/store/mortgageMarketApi";
import MortgageRateWatchBody from "./MortgageRateWatchBody";
import { useMortgageRateWatchMode } from "./useMortgageRateWatchMode";

/**
 * "Can I do better than this rate" — the market side of the mortgage feature.
 *
 * The counterpart to the insurance page's filing check, and it answers a
 * different question. Insurance reports what is coming; this reports what is
 * already available, because a mortgage rate does not change under you — the
 * whole opportunity is that a better one exists elsewhere today.
 *
 * The check is explicit rather than automatic: it reaches out to Freddie Mac,
 * and a page view is not a reason to hit an external service.
 */
export default function MortgageRateWatchSection() {
  const [check, { data, isFetching, isError, isUninitialized }] =
    useLazyGetMortgageRateWatchQuery();

  const mode = useMortgageRateWatchMode({
    hasChecked: !isUninitialized,
    isFetching,
    isError,
    outlookCount: data?.outlooks.length ?? 0,
  });

  return (
    <section className="space-y-3" data-testid="mortgage-rate-watch-section">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Check for better rates</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Freddie Mac&apos;s weekly national averages, measured against the
            loans you hold.
          </p>
        </div>
        <LoadingButton
          isLoading={isFetching}
          loadingText="Checking rates..."
          onClick={() => void check()}
          data-testid="check-mortgage-rates-button"
        >
          Check rates
        </LoadingButton>
      </div>

      <MortgageRateWatchBody
        mode={mode}
        data={data}
        onRecheck={() => void check()}
      />
    </section>
  );
}
