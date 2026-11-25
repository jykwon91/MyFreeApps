import type { MonthlyExpenseTransaction } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expense-transaction";
import { MONTHLY_EXPENSES_MESSAGES as MSG } from "@/shared/lib/monthly-expenses-messages";
import { MONTHLY_EXPENSE_PAYMENTS_PAGE_SIZE } from "@/shared/lib/monthly-expenses-pages";
import MonthlyExpenseTransactionItem from "./MonthlyExpenseTransactionItem";
import ShowMoreButton from "./ShowMoreButton";
import { useShowMore } from "./useShowMore";

export interface MonthlyExpenseTransactionListProps {
  transactions: MonthlyExpenseTransaction[];
  currency: string;
}

/** Every payment under the heading, newest first, a page at a time. */
export default function MonthlyExpenseTransactionList({ transactions, currency }: MonthlyExpenseTransactionListProps) {
  const { shown, remaining, showMore } = useShowMore(transactions, MONTHLY_EXPENSE_PAYMENTS_PAGE_SIZE);

  return (
    <section className="space-y-2" data-testid="monthly-expense-transactions">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {MSG.paymentsTitle} · {MSG.paymentCount(transactions.length)}
      </h4>
      <ul className="space-y-2">
        {shown.map((transaction) => (
          <MonthlyExpenseTransactionItem key={transaction.id} transaction={transaction} currency={currency} />
        ))}
      </ul>
      <ShowMoreButton remaining={remaining} onClick={showMore} testId="monthly-expense-transactions-more" />
    </section>
  );
}
