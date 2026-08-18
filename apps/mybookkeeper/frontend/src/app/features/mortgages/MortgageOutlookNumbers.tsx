import {
  formatBreakeven,
  formatMoneyBand,
  formatMoneyCents,
  formatMonths,
  formatRateBand,
  formatRatePct,
} from "@/shared/lib/mortgage-format";
import type { MortgageRefiOutlook } from "@/shared/types/mortgage/mortgage-refi-outlook";

export interface MortgageOutlookNumbersProps {
  outlook: MortgageRefiOutlook;
}

/**
 * The arithmetic behind one loan's verdict, in the order it was done.
 *
 * Rate, then payments left, then dollars, then what it costs to get them, then
 * how long the costs take to earn back. Read top to bottom it is the argument;
 * skipping to the last row is the answer. The break-even row is last because it
 * is the one that overturns the others — a two-point rate gap on eleven years
 * of payments still loses to $12,000 of closing costs.
 */
export default function MortgageOutlookNumbers({
  outlook,
}: MortgageOutlookNumbersProps) {
  return (
    <dl
      className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm"
      data-testid="mortgage-outlook-numbers"
    >
      <dt className="text-muted-foreground">Your rate</dt>
      <dd className="text-right sm:text-left">
        {formatRatePct(outlook.current_rate_pct)}
      </dd>

      <dt className="text-muted-foreground">A comparable loan today</dt>
      <dd className="text-right sm:text-left">
        {formatRateBand(
          outlook.comparable_rate_low_pct,
          outlook.comparable_rate_high_pct,
        )}
      </dd>

      <dt className="text-muted-foreground">Payments left</dt>
      <dd className="text-right sm:text-left">
        {formatMonths(outlook.remaining_term_months)}
      </dd>

      <dt className="text-muted-foreground">Payment now</dt>
      <dd className="text-right sm:text-left">
        {formatMoneyCents(outlook.current_payment_cents)}
        <span className="text-muted-foreground"> / mo</span>
      </dd>

      <dt className="text-muted-foreground">Payment refinanced</dt>
      <dd className="text-right sm:text-left">
        {formatMoneyBand(
          outlook.new_payment_low_cents,
          outlook.new_payment_high_cents,
        )}
        <span className="text-muted-foreground"> / mo</span>
      </dd>

      <dt className="text-muted-foreground">You&apos;d save</dt>
      <dd className="text-right sm:text-left font-medium">
        {formatMoneyBand(
          outlook.monthly_saving_low_cents,
          outlook.monthly_saving_high_cents,
        )}
        <span className="font-normal text-muted-foreground"> / mo</span>
      </dd>

      <dt className="text-muted-foreground">Closing costs</dt>
      <dd className="text-right sm:text-left">
        {formatMoneyBand(
          outlook.closing_cost_low_cents,
          outlook.closing_cost_high_cents,
        )}
      </dd>

      <dt className="text-muted-foreground">Break even after</dt>
      <dd className="text-right sm:text-left font-medium">
        {formatBreakeven(
          outlook.breakeven_low_months,
          outlook.breakeven_high_months,
        )}
      </dd>
    </dl>
  );
}
