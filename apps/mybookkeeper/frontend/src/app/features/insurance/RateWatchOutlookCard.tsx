import RateWatchFilingRow from "@/app/features/insurance/RateWatchFilingRow";
import {
  formatChangePct,
  formatFilingDate,
  formatOutlookHeadline,
} from "@/shared/lib/rate-filing-format";
import { formatAnnualPremium } from "@/shared/lib/insurance-policy-format";
import type { InsurancePolicyRateOutlook } from "@/shared/types/insurance/insurance-policy-rate-outlook";

export interface RateWatchOutlookCardProps {
  outlook: InsurancePolicyRateOutlook;
}

/**
 * One policy's renewal outlook.
 *
 * The projection is stated as an estimate every time it appears. A rate filing
 * is a statewide average across a carrier's whole book, and the operator's own
 * renewal also moves with their coverage amount and claims history — showing it
 * as a firm number would invite them to treat it as a quote.
 */
export default function RateWatchOutlookCard({ outlook }: RateWatchOutlookCardProps) {
  const { projected_change_pct: pct, unavailable_reason: reason } = outlook;

  return (
    <li
      className="rounded-lg border border-border p-4"
      data-testid="rate-watch-outlook-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {/* Both names, always. A property can carry more than one policy — a
            dwelling policy and a separate wind-only one is the common Texas
            shape — and headed by property alone the two cards are
            indistinguishable. */}
        <h3 className="text-sm font-semibold min-w-0">
          {outlook.property_name ? (
            <>
              {outlook.property_name}
              <span className="font-normal text-muted-foreground">
                {" · "}
                {outlook.policy_name}
              </span>
            </>
          ) : (
            outlook.policy_name
          )}
        </h3>
        <span className="text-xs text-muted-foreground">
          Renews {formatFilingDate(outlook.expiration_date)}
        </span>
      </div>

      {reason ? (
        <p
          className="text-sm text-muted-foreground mt-2"
          data-testid="rate-watch-outlook-unavailable"
        >
          {reason}
        </p>
      ) : (
        <>
          <p className="text-sm mt-2" data-testid="rate-watch-outlook-headline">
            {formatOutlookHeadline(pct, outlook.carrier)}
          </p>

          {pct !== null && pct !== 0 ? (
            <p
              className="text-lg font-semibold mt-1"
              data-testid="rate-watch-outlook-projection"
            >
              {formatAnnualPremium(outlook.current_premium_cents)}
              {" → "}
              {formatAnnualPremium(outlook.projected_premium_cents)}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                ({formatChangePct(pct)}, estimated)
              </span>
            </p>
          ) : null}
        </>
      )}

      {outlook.filings.length > 0 ? (
        <ul className="mt-3">
          {outlook.filings.map((filing) => (
            <RateWatchFilingRow key={filing.serff_id} filing={filing} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
