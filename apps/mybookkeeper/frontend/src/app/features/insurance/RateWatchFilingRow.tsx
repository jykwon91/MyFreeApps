import Badge from "@/shared/components/ui/Badge";
import {
  filingChangeColor,
  filingStatusColor,
  formatChangePct,
  formatFilingDate,
  formatFilingStatus,
} from "@/shared/lib/rate-filing-format";
import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

export interface RateWatchFilingRowProps {
  filing: InsuranceRateFiling;
}

/**
 * One carrier's filing in the market list.
 *
 * Compact on purpose — this list is scanned for carrier names to read out to an
 * agent, and a sentence per row would bury them. Policy cards use
 * ``RateWatchFilingDetail`` instead, which spells the status out; the two
 * shapes stopped being one component with a flag when the flag was doing more
 * than hiding a name.
 */
export default function RateWatchFilingRow({
  filing,
}: RateWatchFilingRowProps) {
  return (
    <li
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 border-b border-border last:border-0"
      data-testid="rate-watch-filing-row"
    >
      {/* Never truncated. This list exists to be read to an agent, and half a
          carrier's name is not a name. */}
      <span className="text-sm font-medium">{filing.company_name}</span>

      <Badge
        label={formatChangePct(filing.percent_change)}
        color={filingChangeColor(filing.percent_change)}
      />

      <Badge
        label={formatFilingStatus(filing)}
        color={filingStatusColor(filing)}
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
