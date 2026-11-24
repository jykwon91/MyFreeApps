import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@platform/ui";
import { useListFinancialAccountsQuery } from "@mybookkeeper/api-client/store/financialAccountsApi";
import { useListHoldingsQuery } from "@mybookkeeper/api-client/store/holdingsApi";
import type { Holding } from "@mybookkeeper/api-client/types/investments/holding";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import EmptyState from "@/shared/components/ui/EmptyState";
import AddHoldingDialog from "@/app/features/holdings/AddHoldingDialog";
import EditHoldingDialog from "@/app/features/holdings/EditHoldingDialog";
import HoldingsAccountPicker from "@/app/features/holdings/HoldingsAccountPicker";
import HoldingsBody from "@/app/features/holdings/HoldingsBody";
import HoldingsSkeleton from "@/app/features/holdings/HoldingsSkeleton";
import RemoveHoldingDialog from "@/app/features/holdings/RemoveHoldingDialog";
import { holdingsAccountFrom, holdingsSearchParams } from "@/app/features/holdings/holdings-search-params";
import { investmentAccounts, manualInvestmentAccounts } from "@/app/features/holdings/investment-accounts";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";

const ACCOUNTS_PATH = "/financial-accounts";

/**
 * What the investment accounts hold: totals, the split by type, and every
 * holding with its gain or loss. One account or all of them, kept in
 * ``?account=`` so a reload keeps it; a change replaces the history entry.
 * Holdings synced from a bank are read-only; ones in a hand-kept account can
 * be added, edited and removed, and set that account's balance.
 */
export default function Investments() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const accountId = holdingsAccountFrom(searchParams);
  const accountsQuery = useListFinancialAccountsQuery();
  const holdingsQuery = useListHoldingsQuery(accountId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [removing, setRemoving] = useState<Holding | null>(null);

  const allAccounts = accountsQuery.data?.items ?? [];
  const accounts = investmentAccounts(allAccounts);
  const scopedManual = manualInvestmentAccounts(allAccounts).filter((account) => accountId === null || account.id === accountId);
  const canAdd = scopedManual.length > 0;
  const defaultAccountId = scopedManual.length === 1 ? scopedManual[0].id : null;

  function body() {
    if (accountsQuery.isLoading) return <HoldingsSkeleton />;
    if (accountsQuery.isError) {
      return <LoadErrorAlert message={MSG.loadFailed} isRetrying={accountsQuery.isFetching} onRetry={() => void accountsQuery.refetch()} />;
    }
    if (accounts.length === 0) {
      return (
        <div className="border rounded-lg" data-testid="holdings-no-accounts">
          <EmptyState message={MSG.noAccounts} action={{ label: MSG.noAccountsAction, onClick: () => navigate(ACCOUNTS_PATH) }} />
        </div>
      );
    }
    return (
      <HoldingsBody
        data={holdingsQuery.currentData}
        isLoading={holdingsQuery.currentData === undefined && holdingsQuery.isFetching}
        isError={holdingsQuery.isError}
        isRetrying={holdingsQuery.isFetching}
        onRetry={() => void holdingsQuery.refetch()}
        canAddManually={canAdd}
        onAdd={() => setAdding(true)}
        onEdit={setEditing}
        onRemove={setRemoving}
      />
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title={MSG.pageTitle}
        subtitle={MSG.pageSubtitle}
        actions={canAdd ? (
          <Button type="button" variant="primary" size="md" className="min-h-[44px]" onClick={() => setAdding(true)} data-testid="add-holding-button">
            {MSG.add}
          </Button>
        ) : null}
      />
      {accounts.length > 1 ? (
        <HoldingsAccountPicker
          accounts={accounts}
          value={accountId}
          onChange={(next) => setSearchParams(holdingsSearchParams(next), { replace: true })}
        />
      ) : null}
      {body()}
      {adding ? (
        <AddHoldingDialog accounts={scopedManual} defaultAccountId={defaultAccountId} onClose={() => setAdding(false)} />
      ) : null}
      {editing ? <EditHoldingDialog holding={editing} onClose={() => setEditing(null)} /> : null}
      {removing ? <RemoveHoldingDialog holding={removing} onClose={() => setRemoving(null)} /> : null}
    </div>
  );
}
