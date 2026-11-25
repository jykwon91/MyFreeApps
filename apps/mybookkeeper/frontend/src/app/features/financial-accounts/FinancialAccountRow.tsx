import { Link } from "react-router-dom";
import { Button } from "@platform/ui";
import { FINANCIAL_ACCOUNT_TYPE_LABELS } from "@mybookkeeper/api-client/constants/financialAccountTypes";
import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import { formatAccountBalance, formatAccountDate } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { financialAccountLabel } from "@mybookkeeper/api-client/utils/financialAccountLabel";
import { FINANCIAL_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/financial-account-messages";
import { transactionsForAccountPath } from "@/shared/lib/transactions-account-link";

export interface FinancialAccountRowProps {
  account: FinancialAccount;
  onEdit: (account: FinancialAccount) => void;
  onUpdateBalance: (account: FinancialAccount) => void;
}

function balanceNote(account: FinancialAccount): string {
  if (account.closed_on !== null) return MSG.closedOn(formatAccountDate(account.closed_on));
  if (account.balance_as_of === null) return MSG.noBalance;
  return MSG.balanceAsOf(formatAccountDate(account.balance_as_of));
}

/** One account: what it is on the left, what it holds and since when on the right, and a link to its transactions. */
export default function FinancialAccountRow({ account, onEdit, onUpdateBalance }: FinancialAccountRowProps) {
  const details = [
    FINANCIAL_ACCOUNT_TYPE_LABELS[account.account_type],
    account.institution_name,
    account.plaid_item_id !== null ? MSG.syncedFromBank : null,
  ].filter(Boolean).join(" · ");
  const isOpen = account.closed_on === null;

  return (
    <li className="border rounded-lg px-4 py-3 text-sm" data-testid={`financial-account-row-${account.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium truncate" data-testid="financial-account-name">{financialAccountLabel(account)}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{details}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold tabular-nums" data-testid="financial-account-balance">
            {account.current_balance_cents === null ? "—" : formatAccountBalance(account.current_balance_cents, account.currency)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{balanceNote(account)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {isOpen ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => onUpdateBalance(account)} data-testid="financial-account-update-balance">
            {MSG.updateBalance}
          </Button>
        ) : null}
        <Button type="button" variant="secondary" size="sm" onClick={() => onEdit(account)} data-testid="financial-account-edit">
          {MSG.edit}
        </Button>
        <Link
          to={transactionsForAccountPath(account.id)}
          className="inline-flex min-h-[44px] sm:min-h-[32px] items-center px-2 text-xs font-medium text-primary hover:underline"
          data-testid="financial-account-transactions"
        >
          {MSG.viewTransactions}
        </Link>
      </div>
    </li>
  );
}
