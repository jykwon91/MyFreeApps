import RateWatchFilingRow from "@/app/features/insurance/RateWatchFilingRow";
import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

export interface RateWatchMarketListProps {
  filings: InsuranceRateFiling[];
}

/**
 * The dwelling market: who last moved their landlord rates, and by how much.
 *
 * This is the half the operator can act on. A dwelling policy is written
 * through an agent rather than bought online, so the useful thing to walk into
 * that conversation with is the list of carriers currently holding flat — and
 * the ones to avoid asking about.
 */
export default function RateWatchMarketList({ filings }: RateWatchMarketListProps) {
  if (filings.length === 0) return null;

  return (
    <section
      className="rounded-lg border border-border p-4"
      data-testid="rate-watch-market-list"
    >
      <h3 className="text-sm font-semibold">Recent landlord-policy filings</h3>
      <p className="text-xs text-muted-foreground mt-0.5">
        One row per carrier, most recent first. A carrier holding flat is worth
        asking your agent about.
      </p>

      <ul className="mt-3">
        {filings.map((filing) => (
          <RateWatchFilingRow key={filing.serff_id} filing={filing} />
        ))}
      </ul>
    </section>
  );
}
