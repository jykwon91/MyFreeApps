import RateWatchResults from "@/app/features/insurance/RateWatchResults";
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
      return data ? <RateWatchResults data={data} /> : null;
  }
}
