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
}

/**
 * One filing, as a line.
 *
 * The status badge is not decoration. A carrier that asked for 15% and was
 * refused reads identically to one that got it unless the disposition is on
 * the row, and only one of those changes what the operator will pay.
 */
export default function RateWatchFilingRow({ filing }: RateWatchFilingRowProps) {
  return (
    <li
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 border-b border-border last:border-0"
      data-testid="rate-watch-filing-row"
    >
      <span className="text-sm font-medium min-w-0 flex-1 truncate">
        {filing.company_name}
      </span>

      <Badge
        label={formatChangePct(filing.percent_change)}
        color={changeColor(filing.percent_change)}
      />

      <Badge
        label={formatFilingStatus(filing)}
        color={filing.is_in_force ? "gray" : "yellow"}
      />

      <span className="text-xs text-muted-foreground w-full sm:w-auto">
        {filing.product_name ?? "Unnamed program"} · renewals from{" "}
        {formatFilingDate(filing.effective_date_renewal)}
      </span>
    </li>
  );
}
