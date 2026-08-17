import AlertBox from "@/shared/components/ui/AlertBox";
import RateWatchMarketList from "@/app/features/insurance/RateWatchMarketList";
import RateWatchOutlookCard from "@/app/features/insurance/RateWatchOutlookCard";
import RateWatchSkeleton from "@/app/features/insurance/RateWatchSkeleton";
import type { InsuranceMarketWatch } from "@/shared/types/insurance/insurance-market-watch";
import type { RateWatchMode } from "@/shared/types/insurance/rate-watch-mode";

export interface RateWatchBodyProps {
  mode: RateWatchMode;
  data: InsuranceMarketWatch | undefined;
}

export default function RateWatchBody({ mode, data }: RateWatchBodyProps) {
  switch (mode) {
    case "loading":
      return <RateWatchSkeleton />;

    case "idle":
      return (
        <p className="text-sm text-muted-foreground" data-testid="rate-watch-idle">
          Texas carriers must file a rate change with the state before they can
          charge it, months before the renewal notice reaches you. This checks
          the landlord-policy filings against every policy you hold.
        </p>
      );

    case "error":
      return (
        <p className="text-sm text-muted-foreground" data-testid="rate-watch-error">
          Couldn't reach the filing data. Nothing is wrong with your policies —
          try again shortly.
        </p>
      );

    case "empty":
      return (
        <p className="text-sm text-muted-foreground" data-testid="rate-watch-empty">
          No active insurance policies on file yet. Add one and we'll have
          something to check the filings against.
        </p>
      );

    case "results":
      return (
        <div className="space-y-4" data-testid="rate-watch-results">
          {data?.feed_unavailable_reason ? (
            <AlertBox variant="warning">{data.feed_unavailable_reason}</AlertBox>
          ) : null}

          <ul className="space-y-3">
            {(data?.outlooks ?? []).map((outlook) => (
              <RateWatchOutlookCard key={outlook.policy_id} outlook={outlook} />
            ))}
          </ul>

          <RateWatchMarketList filings={data?.market_filings ?? []} />

          {/* Stated once, at the bottom. Every figure above is a carrier's
              statewide average, not a quote on a specific house. */}
          <p className="text-xs text-muted-foreground">
            Filings come from the Texas Department of Insurance. A filed change
            is a statewide average across the carrier's whole book — your own
            renewal also moves with your coverage amount and claims history.
          </p>
        </div>
      );
  }
}
