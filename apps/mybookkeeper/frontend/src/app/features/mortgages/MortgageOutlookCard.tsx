import { formatRatePct } from "@/shared/lib/mortgage-format";
import {
  MORTGAGE_VERDICT_BORDER,
  MORTGAGE_VERDICT_HEADLINE,
} from "@/shared/lib/mortgage-verdict-labels";
import type { MortgageRefiOutlook } from "@/shared/types/mortgage/mortgage-refi-outlook";
import MortgageOutlookNumbers from "./MortgageOutlookNumbers";
import PropertyOccupancyFixer from "./PropertyOccupancyFixer";

export interface MortgageOutlookCardProps {
  outlook: MortgageRefiOutlook;
  /** Re-runs the check after a blocker on this card has been cleared. */
  onRecheck: () => void;
}

/**
 * One loan's refinance outlook.
 *
 * Every loan gets a card, including ones that structurally cannot be compared.
 * The insurance version shipped footnoting those, and an operator holding three
 * policies saw one card and asked why only one property had been looked at — a
 * loan that was answered looked like a loan that was skipped.
 *
 * A card with nothing to do is drawn quieter than one worth acting on. Giving
 * all three equal weight leaves the eye nowhere to land.
 */
export default function MortgageOutlookCard({
  outlook,
  onRecheck,
}: MortgageOutlookCardProps) {
  return (
    <li
      className={`rounded-lg border p-4 ${MORTGAGE_VERDICT_BORDER[outlook.verdict]}`}
      data-testid="mortgage-outlook-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold min-w-0">
          {outlook.property_name}
          {outlook.lender ? (
            <span className="font-normal text-muted-foreground">
              {" · "}
              {outlook.lender}
            </span>
          ) : null}
        </h3>
        <span className="text-xs text-muted-foreground">
          {formatRatePct(outlook.current_rate_pct)}
        </span>
      </div>

      {outlook.unavailable_reason ? (
        <>
          <p
            className="text-sm text-muted-foreground mt-2"
            data-testid="mortgage-outlook-unavailable"
          >
            {outlook.unavailable_reason}
          </p>
          {/* Renders only when this property's occupancy is what's missing —
              the one blocker on this page that can be cleared in place. */}
          <PropertyOccupancyFixer
            propertyId={outlook.property_id}
            onFixed={onRecheck}
          />
        </>
      ) : (
        <>
          <p
            className="text-sm mt-2"
            data-testid="mortgage-outlook-headline"
          >
            {MORTGAGE_VERDICT_HEADLINE[outlook.verdict]}
          </p>
          <MortgageOutlookNumbers outlook={outlook} />
        </>
      )}
    </li>
  );
}
