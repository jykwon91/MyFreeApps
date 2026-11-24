import type { NetWorth } from "@mybookkeeper/api-client/types/net-worth/net-worth";
import { formatAccountBalance, formatAccountDate } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import FinancialAccountTotalTile from "@/app/features/financial-accounts/FinancialAccountTotalTile";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";

export interface NetWorthHeadlineProps {
  netWorth: NetWorth;
}

/** The total first, then the two sides it is the difference of. */
export default function NetWorthHeadline({ netWorth }: NetWorthHeadlineProps) {
  const money = (cents: number) => formatAccountBalance(cents, netWorth.currency);
  return (
    <div className="space-y-2" data-testid="net-worth-headline">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FinancialAccountTotalTile label={MSG.net} value={money(netWorth.net_cents)} testId="net-worth-total" emphasis />
        <FinancialAccountTotalTile label={MSG.assets} value={money(netWorth.assets_cents)} testId="net-worth-assets" />
        <FinancialAccountTotalTile label={MSG.liabilities} value={money(netWorth.liabilities_cents)} testId="net-worth-liabilities" />
      </div>
      <p className="text-xs text-muted-foreground">{MSG.asOf(formatAccountDate(netWorth.as_of))}</p>
    </div>
  );
}
