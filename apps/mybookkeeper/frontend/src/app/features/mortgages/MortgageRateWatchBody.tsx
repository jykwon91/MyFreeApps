import type { MortgageRateWatch } from "@/shared/types/mortgage/mortgage-rate-watch";
import type { MortgageRateWatchMode } from "@/shared/types/mortgage/mortgage-rate-watch-mode";
import MortgageRateWatchResults from "./MortgageRateWatchResults";
import MortgageRateWatchSkeleton from "./MortgageRateWatchSkeleton";

export interface MortgageRateWatchBodyProps {
  mode: MortgageRateWatchMode;
  data: MortgageRateWatch | undefined;
  onRecheck: () => void;
}

export default function MortgageRateWatchBody({
  mode,
  data,
  onRecheck,
}: MortgageRateWatchBodyProps) {
  switch (mode) {
    case "loading":
      return <MortgageRateWatchSkeleton />;

    case "idle":
      return (
        <p
          className="text-sm text-muted-foreground"
          data-testid="mortgage-rate-watch-idle"
        >
          Freddie Mac publishes the average rate lenders quoted nationally each
          week. This compares every loan you&apos;ve recorded against it, adjusts
          for whether the property is a rental or where you live, prices the
          replacement over the payments you have left, and then subtracts what
          refinancing costs — because a rate gap that takes eight years to earn
          back isn&apos;t one. If a loan is worth a phone call, this will say so
          and say why.
        </p>
      );

    case "error":
      return (
        <p
          className="text-sm text-muted-foreground"
          data-testid="mortgage-rate-watch-error"
        >
          Couldn&apos;t reach the weekly rate data. Nothing is wrong with your
          loans — try again shortly.
        </p>
      );

    case "empty":
      return (
        <p
          className="text-sm text-muted-foreground"
          data-testid="mortgage-rate-watch-empty"
        >
          No mortgages on file yet. Add one and there&apos;ll be something to
          compare against the market.
        </p>
      );

    case "results":
      return data ? (
        <MortgageRateWatchResults data={data} onRecheck={onRecheck} />
      ) : null;
  }
}
