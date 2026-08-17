import { LoadingButton } from "@platform/ui";
import RateWatchBody from "@/app/features/insurance/RateWatchBody";
import { useRateWatchMode } from "@/app/features/insurance/useRateWatchMode";
import { useLazyGetInsuranceRateWatchQuery } from "@/shared/store/insuranceMarketApi";

/**
 * "Is my premium about to go up" — the market side of the insurance feature.
 *
 * The counterpart to the utility page's better-plans search, and it has to be
 * shaped differently. There is no marketplace to shop a landlord policy on;
 * what Texas publishes instead is the rate change every carrier must file
 * before charging it. So this reports what is coming rather than what to
 * switch to, which is the more useful half — a renewal quote arrives as a fait
 * accompli, while a filing is public months ahead.
 *
 * The check is explicit rather than automatic: it reaches out to the
 * Department of Insurance, and a page view is not a reason to hit an external
 * service.
 */
export default function RateWatchSection() {
  const [check, { data, isFetching, isError, isUninitialized }] =
    useLazyGetInsuranceRateWatchQuery();

  const mode = useRateWatchMode({
    hasChecked: !isUninitialized,
    isFetching,
    isError,
    outlookCount: data?.outlooks.length ?? 0,
  });

  return (
    <section className="space-y-3" data-testid="rate-watch-section">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Check for rate increases</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Landlord-policy rate filings from the Texas Department of Insurance,
            matched to the policies you hold.
          </p>
        </div>
        <LoadingButton
          isLoading={isFetching}
          loadingText="Checking filings..."
          onClick={() => void check()}
          data-testid="check-rate-filings-button"
        >
          Check filings
        </LoadingButton>
      </div>

      <RateWatchBody mode={mode} data={data} />
    </section>
  );
}
