import RateWatchFilingRow from "@/app/features/insurance/RateWatchFilingRow";
import { MARKET_GROUP_PREVIEW } from "@/shared/lib/rate-watch-constants";
import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

export interface RateWatchMarketGroupProps {
  title: string;
  blurb: string;
  filings: InsuranceRateFiling[];
  testId: string;
}

/**
 * One half of the market: rising, or holding.
 *
 * Capped at a readable preview with the tail behind a native `<details>`. The
 * first cut rendered every carrier at once, and twenty equal-weight rows read
 * as a wall rather than as a shortlist — the length was doing the opposite of
 * what more information is supposed to do.
 */
export default function RateWatchMarketGroup({
  title,
  blurb,
  filings,
  testId,
}: RateWatchMarketGroupProps) {
  if (filings.length === 0) return null;

  const preview = filings.slice(0, MARKET_GROUP_PREVIEW);
  const rest = filings.slice(MARKET_GROUP_PREVIEW);

  return (
    <div data-testid={testId}>
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="text-xs text-muted-foreground mt-0.5">{blurb}</p>

      <ul className="mt-2">
        {preview.map((filing) => (
          <RateWatchFilingRow key={filing.serff_id} filing={filing} />
        ))}
      </ul>

      {rest.length > 0 ? (
        <details className="mt-1">
          <summary className="text-xs text-muted-foreground cursor-pointer py-2">
            Show {rest.length} more
          </summary>
          <ul>
            {rest.map((filing) => (
              <RateWatchFilingRow key={filing.serff_id} filing={filing} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
