import Badge, { type BadgeColor } from "@/shared/components/ui/Badge";
import {
  formatChangePct,
  formatFilingDate,
  formatFilingStatus,
} from "@/shared/lib/rate-filing-format";
import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

/** Green for a decrease, orange for a rise, grey for flat or unstated. */
function changeColor(pct: number | null): BadgeColor {
  if (pct === null || pct === 0) return "gray";
  return pct > 0 ? "orange" : "green";
}

export interface RateWatchFilingRowProps {
  filing: InsuranceRateFiling;
  /**
   * Off inside a policy card, which has already named the carrier in its
   * heading and again in its headline — a third printing is just repetition.
   */
  showCarrier?: boolean;
}

/**
 * One filing, as a line.
 *
 * The status badge is not decoration. A carrier that asked for 15% and was
 * refused reads identically to one that got it unless the disposition is on
 * the row, and only one of those changes what the operator will pay.
 */
export default function RateWatchFilingRow({
  filing,
  showCarrier = true,
}: RateWatchFilingRowProps) {
  return (
    <li
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 border-b border-border last:border-0"
      data-testid="rate-watch-filing-row"
    >
      {showCarrier ? (
        // Never truncated. This list exists to be read to an agent, and half a
        // carrier's name is not a name.
        <span className="text-sm font-medium">{filing.company_name}</span>
      ) : null}

      <Badge
        label={formatChangePct(filing.percent_change)}
        color={changeColor(filing.percent_change)}
      />

      <Badge
        label={formatFilingStatus(filing)}
        color={filing.is_in_force ? "gray" : "yellow"}
      />

      {/* Always its own line. Left to wrap only when it does not fit, the
          badges landed in a different place on every row and the list read as
          ragged rather than as a column. */}
      <span className="text-xs text-muted-foreground basis-full">
        {filing.product_name ?? "Unnamed program"} · renewals from{" "}
        {formatFilingDate(filing.effective_date_renewal)}
      </span>
    </li>
  );
}
