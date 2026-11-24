import type { HoldingTotals } from "@mybookkeeper/api-client/types/investments/holding-totals";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { formatGainLossPercent } from "@mybookkeeper/api-client/utils/holdingFormat";
import FinancialAccountTotalTile from "@/app/features/financial-accounts/FinancialAccountTotalTile";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";

export interface HoldingsTotalsProps {
  totals: HoldingTotals;
  currency: string;
}

function gainLossText(totals: HoldingTotals, currency: string): string {
  if (totals.gain_loss_cents === null) return "—";
  const sign = totals.gain_loss_cents > 0 ? "+" : "";
  return `${sign}${formatAccountBalance(totals.gain_loss_cents, currency)} (${formatGainLossPercent(totals.gain_loss_percent)})`;
}

/** Value, cost basis and gain / loss of the holdings shown. */
export default function HoldingsTotals({ totals, currency }: HoldingsTotalsProps) {
  const money = (cents: number | null) => (cents === null ? "—" : formatAccountBalance(cents, currency));
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="holdings-totals">
        <FinancialAccountTotalTile label={MSG.totalValue} value={money(totals.value_cents)} testId="holdings-total-value" emphasis />
        <FinancialAccountTotalTile label={MSG.totalCostBasis} value={money(totals.cost_basis_cents)} testId="holdings-total-cost-basis" />
        <FinancialAccountTotalTile label={MSG.totalGainLoss} value={gainLossText(totals, currency)} testId="holdings-total-gain-loss" />
      </div>
      <p className="text-xs text-muted-foreground">{MSG.gainLossCoverage}</p>
    </div>
  );
}
