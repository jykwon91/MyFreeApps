import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import type { FinancialAccountListResponse } from "@mybookkeeper/api-client/types/financial-account/financial-account-list-response";
import { groupFinancialAccounts } from "@mybookkeeper/api-client/utils/groupFinancialAccounts";
import EmptyState from "@/shared/components/ui/EmptyState";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { FINANCIAL_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/financial-account-messages";
import FinancialAccountSection from "./FinancialAccountSection";
import FinancialAccountsSkeleton from "./FinancialAccountsSkeleton";
import FinancialAccountsTotals from "./FinancialAccountsTotals";

export interface FinancialAccountsBodyProps {
  data: FinancialAccountListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  onAdd: () => void;
  onEdit: (account: FinancialAccount) => void;
  onUpdateBalance: (account: FinancialAccount) => void;
}

export default function FinancialAccountsBody({
  data, isLoading, isError, isRetrying, onRetry, onAdd, onEdit, onUpdateBalance,
}: FinancialAccountsBodyProps) {
  if (isLoading) return <FinancialAccountsSkeleton />;
  if (isError || !data) return <LoadErrorAlert message={MSG.loadFailed} isRetrying={isRetrying} onRetry={onRetry} />;
  if (data.items.length === 0) {
    return <EmptyState message={MSG.emptyList} action={{ label: MSG.emptyListAction, onClick: onAdd }} />;
  }

  const groups = groupFinancialAccounts(data.items);
  return (
    <div className="space-y-6">
      <FinancialAccountsTotals totals={data.totals} />
      <FinancialAccountSection title={MSG.assets} testId="financial-accounts-assets" accounts={groups.assets} onEdit={onEdit} onUpdateBalance={onUpdateBalance} />
      <FinancialAccountSection title={MSG.liabilities} testId="financial-accounts-liabilities" accounts={groups.liabilities} onEdit={onEdit} onUpdateBalance={onUpdateBalance} />
      <FinancialAccountSection title={MSG.closed} testId="financial-accounts-closed" accounts={groups.closed} onEdit={onEdit} onUpdateBalance={onUpdateBalance} />
    </div>
  );
}
