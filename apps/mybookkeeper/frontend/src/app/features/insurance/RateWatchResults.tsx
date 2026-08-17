import AlertBox from "@/shared/components/ui/AlertBox";
import RateWatchMarketList from "@/app/features/insurance/RateWatchMarketList";
import RateWatchOutOfScopeNote from "@/app/features/insurance/RateWatchOutOfScopeNote";
import RateWatchOutlookCard from "@/app/features/insurance/RateWatchOutlookCard";
import RateWatchVerdict from "@/app/features/insurance/RateWatchVerdict";
import { buildRateWatchVerdict } from "@/shared/lib/rate-watch-verdict";
import type { InsuranceMarketWatch } from "@/shared/types/insurance/insurance-market-watch";

export interface RateWatchResultsProps {
  data: InsuranceMarketWatch;
}

/**
 * The loaded section, in the order it should be read.
 *
 * Verdict, then the policies it came from, then the market, then the caveat.
 * The first cut had no verdict and opened straight into cards — which is the
 * whole reason the screen had to be read rather than glanced at.
 */
export default function RateWatchResults({ data }: RateWatchResultsProps) {
  const verdict = buildRateWatchVerdict(data);
  // Policies on a form this feed does not cover are collapsed to a footnote
  // rather than given a card each. A full-size card saying "there is nothing to
  // check here" competes for attention with the one that has an answer.
  const checked = data.outlooks.filter((outlook) => outlook.is_checkable);
  const outOfScope = data.outlooks.filter((outlook) => !outlook.is_checkable);

  return (
    <div className="space-y-4" data-testid="rate-watch-results">
      {data.feed_unavailable_reason ? (
        <AlertBox variant="warning">{data.feed_unavailable_reason}</AlertBox>
      ) : null}

      {verdict ? <RateWatchVerdict verdict={verdict} /> : null}

      {checked.length > 0 ? (
        <ul className="space-y-3">
          {checked.map((outlook) => (
            <RateWatchOutlookCard key={outlook.policy_id} outlook={outlook} />
          ))}
        </ul>
      ) : null}

      <RateWatchOutOfScopeNote outlooks={outOfScope} />

      <RateWatchMarketList rising={data.market_rising} flat={data.market_flat} />

      {/* Stated once, at the bottom. Every figure above is a carrier's
          statewide average, not a quote on a specific house. */}
      <p className="text-xs text-muted-foreground">
        Filings come from the Texas Department of Insurance. A filed change is a
        statewide average across the carrier's whole book — your own renewal also
        moves with your coverage amount and claims history.
      </p>
    </div>
  );
}
