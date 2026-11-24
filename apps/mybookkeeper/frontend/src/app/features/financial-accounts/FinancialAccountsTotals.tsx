import type { FinancialAccountTotals } from "@mybookkeeper/api-client/types/financial-account/financial-account-totals";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { FINANCIAL_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/financial-account-messages";
import FinancialAccountTotalTile from "./FinancialAccountTotalTile";

export interface FinancialAccountsTotalsProps {
  totals: readonly FinancialAccountTotals[];
}

/** What you have, what you owe and the difference, per currency. Totals are never converted across currencies. */
export default function FinancialAccountsTotals({ totals }: FinancialAccountsTotalsProps) {
  if (totals.length === 0) {
    return <p className="text-sm text-muted-foreground" data-testid="financial-accounts-no-totals">{MSG.noTotalsYet}</p>;
  }
  const showCurrency = totals.length > 1;
  return (
    <div className="space-y-3" data-testid="financial-accounts-totals">
      {totals.map((total) => (
        <div key={total.currency} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FinancialAccountTotalTile
            label={showCurrency ? `${MSG.assets} (${total.currency})` : MSG.assets}
            value={formatAccountBalance(total.assets_cents, total.currency)}
            testId="financial-accounts-total-assets"
          />
          <FinancialAccountTotalTile
            label={showCurrency ? `${MSG.liabilities} (${total.currency})` : MSG.liabilities}
            value={formatAccountBalance(total.liabilities_cents, total.currency)}
            testId="financial-accounts-total-liabilities"
          />
          <FinancialAccountTotalTile
            label={showCurrency ? `${MSG.net} (${total.currency})` : MSG.net}
            value={formatAccountBalance(total.net_cents, total.currency)}
            testId="financial-accounts-total-net"
            emphasis
          />
        </div>
      ))}
    </div>
  );
}
