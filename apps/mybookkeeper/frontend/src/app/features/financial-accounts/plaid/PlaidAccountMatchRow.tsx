import { TRANSACTION_SCOPE_LABELS, TRANSACTION_SCOPES } from "@mybookkeeper/api-client/constants/transactionScopes";
import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import type { PlaidAccountSelection } from "@mybookkeeper/api-client/types/plaid/plaid-account-selection";
import type { PlaidLinkAccount } from "@mybookkeeper/api-client/types/plaid/plaid-link-account";
import type { TransactionScope } from "@mybookkeeper/api-client/types/transaction/TransactionScope";
import { financialAccountLabel } from "@mybookkeeper/api-client/utils/financialAccountLabel";
import Select from "@/shared/components/ui/Select";
import { PLAID_MESSAGES as MSG } from "@/shared/lib/plaid-messages";

const NEW_ACCOUNT = "";

function scopeFrom(value: string): TransactionScope {
  return TRANSACTION_SCOPES.find((scope) => scope === value) ?? "personal";
}

export interface PlaidAccountMatchRowProps {
  account: PlaidLinkAccount;
  selection: PlaidAccountSelection;
  /** Accounts this one may be linked to: linkable and not already chosen for another bank account. */
  options: readonly FinancialAccount[];
  onChange: (selection: PlaidAccountSelection) => void;
}

/** One bank account: add it or link it, and how its transactions are filed. */
export default function PlaidAccountMatchRow({ account, selection, options, onChange }: PlaidAccountMatchRowProps) {
  const linkId = `plaid-link-${account.id}`;
  const scopeId = `plaid-scope-${account.id}`;

  return (
    <li className="border rounded-lg px-4 py-3 space-y-3 text-sm" data-testid={`plaid-match-row-${account.id}`}>
      <p className="font-medium">{financialAccountLabel(account)}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={linkId} className="text-xs text-muted-foreground">{MSG.linkTo}</label>
          <Select
            id={linkId}
            className="w-full min-h-[44px]"
            value={selection.financial_account_id ?? NEW_ACCOUNT}
            onChange={(e) => onChange({ ...selection, financial_account_id: e.target.value || null })}
            data-testid="plaid-match-account"
          >
            <option value={NEW_ACCOUNT}>{MSG.addAsNew}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>{financialAccountLabel(option)}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor={scopeId} className="text-xs text-muted-foreground">{MSG.filedAs}</label>
          <Select
            id={scopeId}
            className="w-full min-h-[44px]"
            value={selection.default_transaction_scope}
            onChange={(e) => onChange({ ...selection, default_transaction_scope: scopeFrom(e.target.value) })}
            data-testid="plaid-match-scope"
          >
            {TRANSACTION_SCOPES.map((scope) => (
              <option key={scope} value={scope}>{TRANSACTION_SCOPE_LABELS[scope]}</option>
            ))}
          </Select>
        </div>
      </div>
    </li>
  );
}
