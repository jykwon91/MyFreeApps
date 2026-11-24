import { useState } from "react";
import { Button } from "@platform/ui";
import { useListFinancialAccountsQuery } from "@mybookkeeper/api-client/store/financialAccountsApi";
import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AddFinancialAccountDialog from "@/app/features/financial-accounts/AddFinancialAccountDialog";
import EditFinancialAccountDialog from "@/app/features/financial-accounts/EditFinancialAccountDialog";
import FinancialAccountsBody from "@/app/features/financial-accounts/FinancialAccountsBody";
import UpdateBalanceDialog from "@/app/features/financial-accounts/UpdateBalanceDialog";
import { FINANCIAL_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/financial-account-messages";

/**
 * Every account the person holds money in or owes money on, grouped into what
 * they have and what they owe, with the totals on top. Closed accounts stay
 * listed at the bottom so their history isn't lost, but never count.
 */
export default function FinancialAccounts() {
  const query = useListFinancialAccountsQuery();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FinancialAccount | null>(null);
  const [updatingBalance, setUpdatingBalance] = useState<FinancialAccount | null>(null);

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <SectionHeader
        title={MSG.pageTitle}
        subtitle={MSG.pageSubtitle}
        actions={
          <Button type="button" variant="primary" size="md" onClick={() => setAdding(true)} data-testid="add-financial-account-button">
            {MSG.add}
          </Button>
        }
      />

      <FinancialAccountsBody
        data={query.data}
        isLoading={query.isLoading}
        isError={query.isError}
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
        onAdd={() => setAdding(true)}
        onEdit={setEditing}
        onUpdateBalance={setUpdatingBalance}
      />

      {adding ? <AddFinancialAccountDialog onClose={() => setAdding(false)} /> : null}
      {editing ? <EditFinancialAccountDialog account={editing} onClose={() => setEditing(null)} /> : null}
      {updatingBalance ? <UpdateBalanceDialog account={updatingBalance} onClose={() => setUpdatingBalance(null)} /> : null}
    </div>
  );
}
