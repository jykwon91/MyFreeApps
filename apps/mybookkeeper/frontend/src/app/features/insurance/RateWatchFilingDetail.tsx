import Badge from "@/shared/components/ui/Badge";
import {
  filingChangeColor,
  formatChangePct,
  formatFilingConsequence,
  formatFilingDate,
} from "@/shared/lib/rate-filing-format";
import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

export interface RateWatchFilingDetailProps {
  filing: InsuranceRateFiling;
}

/**
 * One filing on a policy card, written as a sentence.
 *
 * The market list uses a compact row with two badges, which is right for
 * twenty-five carriers being scanned for names. On a policy card there are at
 * most a handful of filings and the operator is deciding whether to act, so the
 * badge that read `Proposed` becomes a clause that says what proposed costs
 * them. That word was one of four the operator had to ask about.
 *
 * The carrier is never repeated here — the card heading and its headline have
 * both already named it.
 */
export default function RateWatchFilingDetail({
  filing,
}: RateWatchFilingDetailProps) {
  return (
    <li
      className="py-2 border-b border-border last:border-0"
      data-testid="rate-watch-filing-detail"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Badge
          label={formatChangePct(filing.percent_change)}
          color={filingChangeColor(filing.percent_change)}
        />
        <span className="text-sm">{formatFilingConsequence(filing)}</span>
      </div>

      <p className="text-xs text-muted-foreground mt-0.5">
        {filing.product_name ?? "Unnamed program"} · renewals from{" "}
        {formatFilingDate(filing.effective_date_renewal)}
      </p>
    </li>
  );
}
