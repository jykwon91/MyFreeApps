import { useMemo, useState } from "react";
import { Button, LoadingButton, showError, showSuccess } from "@platform/ui";
import { useListFinancialAccountsQuery } from "@mybookkeeper/api-client/store/financialAccountsApi";
import { useConnectPlaidItemMutation } from "@mybookkeeper/api-client/store/plaidApi";
import type { PlaidAccountSelection } from "@mybookkeeper/api-client/types/plaid/plaid-account-selection";
import type { PlaidPendingConnection } from "@mybookkeeper/api-client/types/plaid/plaid-pending-connection";
import { rejectedWriteDetail } from "@mybookkeeper/api-client/utils/rejectedWriteDetail";
import { linkableFinancialAccounts, suggestPlaidAccountMatches } from "@mybookkeeper/api-client/utils/suggestPlaidAccountMatch";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import { PLAID_MESSAGES as MSG } from "@/shared/lib/plaid-messages";
import PlaidAccountMatchRow from "./PlaidAccountMatchRow";

export interface PlaidAccountMatchDialogProps {
  connection: PlaidPendingConnection;
  onClose: () => void;
}

/**
 * After Link: say, for each bank account, whether it is one already tracked
 * (so its history and its synced transactions stay together) or a new one.
 * An existing account with the same last digits is chosen already.
 */
export default function PlaidAccountMatchDialog({ connection, onClose }: PlaidAccountMatchDialogProps) {
  const accountsQuery = useListFinancialAccountsQuery();
  const [connect, { isLoading }] = useConnectPlaidItemMutation();
  const linkable = useMemo(() => linkableFinancialAccounts(accountsQuery.data?.items ?? []), [accountsQuery.data]);
  const [selections, setSelections] = useState<PlaidAccountSelection[] | null>(null);

  const current = useMemo<PlaidAccountSelection[]>(() => {
    if (selections !== null) return selections;
    const suggested = suggestPlaidAccountMatches(connection.accounts, linkable);
    return connection.accounts.map((account) => ({
      plaid_account_id: account.id,
      financial_account_id: suggested[account.id] ?? null,
      default_transaction_scope: "personal",
    }));
  }, [selections, connection.accounts, linkable]);

  function change(index: number, next: PlaidAccountSelection) {
    setSelections(current.map((selection, i) => (i === index ? next : selection)));
  }

  function optionsFor(index: number) {
    const takenElsewhere = new Set(
      current.filter((_, i) => i !== index).map((s) => s.financial_account_id).filter((id): id is string => id !== null),
    );
    return linkable.filter((account) => !takenElsewhere.has(account.id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const item = await connect({
        public_token: connection.publicToken,
        institution_id: connection.institutionId,
        institution_name: connection.institutionName,
        accounts: current,
      }).unwrap();
      showSuccess(MSG.connected(item.institution_name ?? MSG.unknownBank));
      onClose();
    } catch (err) {
      showError(rejectedWriteDetail(err, MSG.connectFailed));
    }
  }

  return (
    <FormDialogShell title={MSG.matchTitle} testId="plaid-match-dialog" onClose={onClose} width="wide">
      <form noValidate onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground">{MSG.matchHint}</p>
        <ul className="space-y-3">
          {connection.accounts.map((account, index) => (
            <PlaidAccountMatchRow
              key={account.id}
              account={account}
              selection={current[index]}
              options={optionsFor(index)}
              onChange={(next) => change(index, next)}
            />
          ))}
        </ul>
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" size="md" className="min-h-[44px]" onClick={onClose}>Cancel</Button>
          <LoadingButton
            type="submit" variant="primary" size="md" className="min-h-[44px]"
            isLoading={isLoading} loadingText={MSG.saving} disabled={accountsQuery.isLoading}
            data-testid="plaid-match-save"
          >
            {MSG.save}
          </LoadingButton>
        </div>
      </form>
    </FormDialogShell>
  );
}
