import RateWatchMarketGroup from "@/app/features/insurance/RateWatchMarketGroup";
import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

export interface RateWatchMarketListProps {
  rising: InsuranceRateFiling[];
  flat: InsuranceRateFiling[];
}

/**
 * The dwelling market, as two answers rather than one table.
 *
 * A dwelling policy is written through an agent rather than bought online, so
 * what the operator needs from this is a short list of names to raise on a
 * call — and a shorter list to skip. Pooling both into one percentage-ordered
 * table made them do that sorting by eye.
 */
export default function RateWatchMarketList({
  rising,
  flat,
}: RateWatchMarketListProps) {
  if (rising.length === 0 && flat.length === 0) return null;

  return (
    <section
      className="rounded-lg border border-border p-4 space-y-4"
      data-testid="rate-watch-market-list"
    >
      <RateWatchMarketGroup
        title="Holding rates flat"
        blurb="Worth asking your agent about — the last dwelling rate each of these filed was unchanged or lower."
        filings={flat}
        testId="rate-watch-market-flat"
      />

      <RateWatchMarketGroup
        title="Raising rates"
        blurb="Filed an increase that has not reached renewals yet."
        filings={rising}
        testId="rate-watch-market-rising"
      />
    </section>
  );
}
