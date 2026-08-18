import AlertBox from "@/shared/components/ui/AlertBox";
import RateWatchActionItem from "@/app/features/insurance/RateWatchActionItem";
import RateWatchMarketList from "@/app/features/insurance/RateWatchMarketList";
import RateWatchOutlookCard from "@/app/features/insurance/RateWatchOutlookCard";
import RateWatchVerdict from "@/app/features/insurance/RateWatchVerdict";
import { buildRateWatchAction } from "@/shared/lib/rate-watch-action";
import { buildRateWatchVerdict } from "@/shared/lib/rate-watch-verdict";
import { formatScopeSummary } from "@/shared/lib/rate-watch-scope";
import type { InsuranceMarketWatch } from "@/shared/types/insurance/insurance-market-watch";

export interface RateWatchResultsProps {
  data: InsuranceMarketWatch;
}

/**
 * The loaded section, in the order it should be read.
 *
 * Verdict, then what to do about it, then every policy it came from, then the
 * market, then the caveat. The action item sits directly under the verdict
 * because the two are one thought: here is what happened, here is the call to
 * make.
 *
 * Every policy gets a card. The previous cut split them — checkable ones as
 * cards, the rest as a footnote — and an operator with three policies saw one
 * card and asked why only one property had been looked at. A policy this feed
 * structurally cannot cover has been answered, not skipped, and it has to be
 * shown as answered.
 */
export default function RateWatchResults({ data }: RateWatchResultsProps) {
  const verdict = buildRateWatchVerdict(data);
  const action = buildRateWatchAction(data);

  return (
    <div className="space-y-4" data-testid="rate-watch-results">
      {data.feed_unavailable_reason ? (
        <AlertBox variant="warning">{data.feed_unavailable_reason}</AlertBox>
      ) : null}

      {verdict ? <RateWatchVerdict verdict={verdict} /> : null}

      {action ? <RateWatchActionItem action={action} /> : null}

      {data.outlooks.length > 0 ? (
        <>
          {/* Stated before the cards, not inferred from them. This is the line
              that answers "why do i only see options for 1 property" — the
              count is the section's own account of what it did. */}
          <p
            className="text-sm text-muted-foreground"
            data-testid="rate-watch-scope"
          >
            {formatScopeSummary(data.outlooks)}
          </p>

          <ul className="space-y-3">
            {data.outlooks.map((outlook) => (
              <RateWatchOutlookCard key={outlook.policy_id} outlook={outlook} />
            ))}
          </ul>
        </>
      ) : null}

      <RateWatchMarketList rising={data.market_rising} flat={data.market_flat} />

      {/* Stated once, at the bottom. Every figure above is a carrier's
          statewide average, not a quote on a specific house. */}
      <p className="text-xs text-muted-foreground">
        Filings come from the Texas Department of Insurance. Every figure above
        is a statewide average across the carrier's whole book, not a quote for
        your property — your own renewal also moves with your coverage amount
        and claims history.
      </p>
    </div>
  );
}
