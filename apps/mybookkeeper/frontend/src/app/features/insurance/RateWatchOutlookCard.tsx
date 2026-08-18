import RateWatchOutlookFilings from "@/app/features/insurance/RateWatchOutlookFilings";
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
 *
 * Every policy gets a card, including ones this feed will never cover. The
 * previous cut footnoted those, and with three policies and one filed increase
 * the operator read a single card and asked "why do i only see options for 1
 * property instead of all?" — a policy that was answered looked like a policy
 * that was skipped.
 */
export default function RateWatchOutlookCard({ outlook }: RateWatchOutlookCardProps) {
  const { projected_change_pct: pct, unavailable_reason: reason } = outlook;
  const hasMovement = reason === null && pct !== null && pct !== 0;
  const delta = formatPremiumDelta(
    outlook.current_premium_cents,
    outlook.projected_premium_cents,
  );

  // Only a filing in force will ever appear on a bill. Listing the rest beside
  // it at equal weight is what put a withdrawn filing next to a live one and
  // left the operator asking what "no change" and "Not approved" meant on the
  // same row — neither of them was going to cost anything.
  const inForce = outlook.filings.filter((filing) => filing.is_in_force);
  const rest = outlook.filings.filter((filing) => !filing.is_in_force);
  const hasPendingOnly = inForce.length === 0 && rest.some((f) => f.is_pending);

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
            {formatOutlookHeadline(pct, outlook.carrier, { hasPendingOnly })}
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

      <RateWatchOutlookFilings inForce={inForce} rest={rest} />
    </li>
  );
}
