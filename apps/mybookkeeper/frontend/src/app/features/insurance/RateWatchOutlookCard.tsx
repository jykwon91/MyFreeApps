import RateWatchFilingRow from "@/app/features/insurance/RateWatchFilingRow";
import {
  formatChangePct,
  formatFilingDate,
  formatOutlookHeadline,
  formatPremiumDelta,
} from "@/shared/lib/rate-filing-format";
import { formatAnnualPremium } from "@/shared/lib/insurance-policy-format";
import type { InsurancePolicyRateOutlook } from "@/shared/types/insurance/insurance-policy-rate-outlook";

export interface RateWatchOutlookCardProps {
  outlook: InsurancePolicyRateOutlook;
}

/**
 * One policy's renewal outlook.
 *
 * A card with nothing to report is drawn quieter than one with an increase on
 * it. Giving every policy identical weight is what made the first cut read as
 * undifferentiated — the eye had nowhere to land, so the one card that mattered
 * looked like the two that did not.
 *
 * The projection is stated as an estimate every time it appears. A rate filing
 * is a statewide average across a carrier's whole book, and the operator's own
 * renewal also moves with their coverage amount and claims history — showing it
 * as a firm number would invite them to treat it as a quote.
 */
export default function RateWatchOutlookCard({ outlook }: RateWatchOutlookCardProps) {
  const { projected_change_pct: pct, unavailable_reason: reason } = outlook;
  const hasMovement = reason === null && pct !== null && pct !== 0;
  const delta = formatPremiumDelta(
    outlook.current_premium_cents,
    outlook.projected_premium_cents,
  );

  return (
    <li
      className={`rounded-lg border p-4 ${
        hasMovement ? "border-border" : "border-border/50"
      }`}
      data-testid="rate-watch-outlook-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {/* The property leads; the form follows in a lighter weight. Both are
            needed because a property can carry a dwelling policy and a separate
            wind-only one, and headed by property alone those two cards are
            indistinguishable. `policy_label` is the policy name with the
            address already stripped — a declarations-page reader puts the whole
            descriptor in the name, so rendering it raw printed the address
            twice in one heading. */}
        <h3 className="text-sm font-semibold min-w-0">
          {outlook.property_name ? (
            <>
              {outlook.property_name}
              <span className="font-normal text-muted-foreground">
                {" · "}
                {outlook.policy_label}
              </span>
            </>
          ) : (
            outlook.policy_label
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
          <p
            className="text-sm text-muted-foreground mt-2"
            data-testid="rate-watch-outlook-headline"
          >
            {formatOutlookHeadline(pct, outlook.carrier)}
          </p>

          {hasMovement ? (
            <p
              className="text-lg font-semibold mt-1"
              data-testid="rate-watch-outlook-projection"
            >
              {formatAnnualPremium(outlook.current_premium_cents)}
              {" → "}
              {formatAnnualPremium(outlook.projected_premium_cents)}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                ({[delta, formatChangePct(pct), "estimated"]
                  .filter(Boolean)
                  .join(", ")})
              </span>
            </p>
          ) : null}
        </>
      )}

      {outlook.filings.length > 0 ? (
        <ul className="mt-3">
          {outlook.filings.map((filing) => (
            <RateWatchFilingRow
              key={filing.serff_id}
              filing={filing}
              showCarrier={false}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
