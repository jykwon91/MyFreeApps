import { useState } from "react";
import { Button, LoadingButton } from "@platform/ui";
import { useListFinancialAccountsQuery } from "@mybookkeeper/api-client/store/financialAccountsApi";
import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AddFinancialAccountDialog from "@/app/features/financial-accounts/AddFinancialAccountDialog";
import EditFinancialAccountDialog from "@/app/features/financial-accounts/EditFinancialAccountDialog";
import FinancialAccountsBody from "@/app/features/financial-accounts/FinancialAccountsBody";
import UpdateBalanceDialog from "@/app/features/financial-accounts/UpdateBalanceDialog";
import ConnectedBanksSection from "@/app/features/financial-accounts/plaid/ConnectedBanksSection";
import PlaidAccountMatchDialog from "@/app/features/financial-accounts/plaid/PlaidAccountMatchDialog";
import { usePlaidLinkFlow } from "@/app/features/financial-accounts/plaid/usePlaidLinkFlow";
import { FINANCIAL_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/financial-account-messages";
import { PLAID_MESSAGES } from "@/shared/lib/plaid-messages";

/**
 * Every account the person holds money in or owes money on, grouped into what
 * they have and what they owe, with the totals on top. Closed accounts stay
 * listed at the bottom so their history isn't lost, but never count.
 *
 * Banks connected through Plaid are listed above the accounts, with their
 * own Sync now / Reconnect / Disconnect; their accounts sit in the same lists
 * as the ones entered by hand.
 */
export default function FinancialAccounts() {
  const query = useListFinancialAccountsQuery();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FinancialAccount | null>(null);
  const [updatingBalance, setUpdatingBalance] = useState<FinancialAccount | null>(null);
  const plaid = usePlaidLinkFlow();

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <SectionHeader
        title={MSG.pageTitle}
        subtitle={MSG.pageSubtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <LoadingButton
              type="button" variant="secondary" size="md" className="min-h-[44px]"
              isLoading={plaid.starting === null} loadingText={PLAID_MESSAGES.connecting}
              onClick={() => void plaid.begin(null)} data-testid="connect-bank-button"
            >
              {PLAID_MESSAGES.connect}
            </LoadingButton>
            <Button type="button" variant="primary" size="md" className="min-h-[44px]" onClick={() => setAdding(true)} data-testid="add-financial-account-button">
              {MSG.add}
            </Button>
          </div>
        }
      />

      <ConnectedBanksSection
        onReconnect={(itemId) => void plaid.begin(itemId)}
        onAddInvestments={(itemId) => void plaid.begin(itemId, { addInvestments: true })}
        reconnectingItemId={plaid.starting}
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
      {plaid.pending ? <PlaidAccountMatchDialog connection={plaid.pending} onClose={plaid.clearPending} /> : null}
    </div>
  );
}
