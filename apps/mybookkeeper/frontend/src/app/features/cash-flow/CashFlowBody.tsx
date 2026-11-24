import type { CashFlow } from "@mybookkeeper/api-client/types/cash-flow/cash-flow";
import { cashFlowChartRows } from "@mybookkeeper/api-client/utils/cashFlowChartRows";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import FinancialAccountTotalTile from "@/app/features/financial-accounts/FinancialAccountTotalTile";
import EmptyState from "@/shared/components/ui/EmptyState";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { CASH_FLOW_MESSAGES as MSG } from "@/shared/lib/cash-flow-messages";
import CashFlowChart from "./CashFlowChart";
import CashFlowSkeleton from "./CashFlowSkeleton";

export interface CashFlowBodyProps {
  data: CashFlow | undefined;
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
}

export default function CashFlowBody({ data, isLoading, isError, isRetrying, onRetry }: CashFlowBodyProps) {
  if (isLoading) return <CashFlowSkeleton />;
  if (isError || !data) return <LoadErrorAlert message={MSG.loadFailed} isRetrying={isRetrying} onRetry={onRetry} />;

  const money = (cents: number) => formatAccountBalance(cents, data.currency);
  const { totals } = data;
  const isEmpty = totals.money_in_cents === 0 && totals.money_out_cents === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="cash-flow-totals">
        <FinancialAccountTotalTile label={MSG.moneyIn} value={money(totals.money_in_cents)} testId="cash-flow-total-in" />
        <FinancialAccountTotalTile label={MSG.moneyOut} value={money(totals.money_out_cents)} testId="cash-flow-total-out" />
        <FinancialAccountTotalTile label={MSG.net} value={money(totals.net_cents)} testId="cash-flow-total-net" emphasis />
      </div>
      <div className="border rounded-lg p-4">
        {isEmpty ? <EmptyState message={MSG.empty} /> : <CashFlowChart rows={cashFlowChartRows(data.months)} />}
      </div>
    </div>
  );
}
