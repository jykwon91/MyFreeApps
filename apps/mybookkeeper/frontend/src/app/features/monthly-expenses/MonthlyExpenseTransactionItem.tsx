import type { MonthlyExpenseTransaction } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expense-transaction";
import { expenseAccountLabel } from "@mybookkeeper/api-client/utils/expenseAccountLabel";
import { formatAccountBalance, formatAccountDate } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { MONTHLY_EXPENSES_MESSAGES as MSG } from "@/shared/lib/monthly-expenses-messages";

export interface MonthlyExpenseTransactionItemProps {
  transaction: MonthlyExpenseTransaction;
  currency: string;
}

/** One payment as a card: who was paid and how much, then when and from which account. */
export default function MonthlyExpenseTransactionItem({ transaction, currency }: MonthlyExpenseTransactionItemProps) {
  return (
    <li className="border rounded-md px-3 py-2 text-sm" data-testid="monthly-expense-transaction">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium min-w-0 break-words" data-testid="monthly-expense-transaction-payee">{transaction.payee}</p>
        <p className="font-semibold tabular-nums shrink-0" data-testid="monthly-expense-transaction-amount">
          {formatAccountBalance(transaction.amount_cents, currency)}
        </p>
      </div>
      <p className="text-xs text-muted-foreground break-words">
        <span data-testid="monthly-expense-transaction-date">{formatAccountDate(transaction.date)}</span>
        {" · "}
        <span data-testid="monthly-expense-transaction-account">{expenseAccountLabel(transaction) ?? MSG.noAccount}</span>
      </p>
      {transaction.description ? (
        <p className="text-xs text-muted-foreground break-words">{transaction.description}</p>
      ) : null}
    </li>
  );
}
