import RateWatchFilingDetail from "@/app/features/insurance/RateWatchFilingDetail";
import { formatFoldSummary } from "@/shared/lib/rate-filing-format";
import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

export interface RateWatchOutlookFilingsProps {
  /** Filings that will actually appear on a bill. */
  inForce: InsuranceRateFiling[];
  /** Pending and withdrawn filings — context, not consequence. */
  rest: InsuranceRateFiling[];
}

/**
 * The filings behind a policy's number, with the binding ones first.
 *
 * Only a filing in force will ever be charged. The previous cut listed all of
 * them at equal weight, which is how a withdrawn filing ended up sitting beside
 * a live one and the operator ended up asking what "no change" and "Not
 * approved" meant — neither of those rows was going to cost anything.
 *
 * The fold appears only when there is something in force to lead with. Folding
 * a card's entire evidence away would leave a headline with nothing visible
 * supporting it, which is the opposite of the problem being fixed.
 */
export default function RateWatchOutlookFilings({
  inForce,
  rest,
}: RateWatchOutlookFilingsProps) {
  if (inForce.length === 0 && rest.length === 0) return null;

  if (inForce.length === 0) {
    return (
      <ul className="mt-3">
        {rest.map((filing) => (
          <RateWatchFilingDetail key={filing.serff_id} filing={filing} />
        ))}
      </ul>
    );
  }

  return (
    <>
      <ul className="mt-3">
        {inForce.map((filing) => (
          <RateWatchFilingDetail key={filing.serff_id} filing={filing} />
        ))}
      </ul>

      {rest.length > 0 ? (
        <details className="mt-2" data-testid="rate-watch-outlook-more">
          <summary className="flex items-center min-h-11 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            {formatFoldSummary(rest)}
          </summary>
          <ul>
            {rest.map((filing) => (
              <RateWatchFilingDetail key={filing.serff_id} filing={filing} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
