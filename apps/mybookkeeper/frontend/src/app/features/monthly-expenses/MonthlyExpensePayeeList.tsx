import type { MonthlyExpensePayee } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expense-payee";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { MONTHLY_EXPENSES_MESSAGES as MSG } from "@/shared/lib/monthly-expenses-messages";
import { MONTHLY_EXPENSE_PAYEES_PAGE_SIZE } from "@/shared/lib/monthly-expenses-pages";
import ShowMoreButton from "./ShowMoreButton";
import { useShowMore } from "./useShowMore";

export interface MonthlyExpensePayeeListProps {
  payees: MonthlyExpensePayee[];
  currency: string;
}

/** Each payee's total under the heading, who got the most first. */
export default function MonthlyExpensePayeeList({ payees, currency }: MonthlyExpensePayeeListProps) {
  const { shown, remaining, showMore } = useShowMore(payees, MONTHLY_EXPENSE_PAYEES_PAGE_SIZE);

  return (
    <section className="space-y-2" data-testid="monthly-expense-payees">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{MSG.payeesTitle}</h4>
      <ul className="divide-y rounded-md border">
        {shown.map((payee) => (
          <li key={payee.payee} className="flex items-center justify-between gap-3 px-3 py-2 text-sm" data-testid="monthly-expense-payee">
            <div className="min-w-0">
              <p className="font-medium break-words" data-testid="monthly-expense-payee-name">{payee.payee}</p>
              <p className="text-xs text-muted-foreground">{MSG.paymentCount(payee.transaction_count)}</p>
            </div>
            <p className="font-semibold tabular-nums shrink-0" data-testid="monthly-expense-payee-total">
              {formatAccountBalance(payee.total_cents, currency)}
            </p>
          </li>
        ))}
      </ul>
      <ShowMoreButton remaining={remaining} onClick={showMore} testId="monthly-expense-payees-more" />
    </section>
  );
}
