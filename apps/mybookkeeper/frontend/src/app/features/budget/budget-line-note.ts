import type { BudgetLine } from "@mybookkeeper/api-client/types/budget/budget-line";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { BUDGET_MESSAGES as MSG } from "@/shared/lib/budget-messages";

export interface BudgetLineNote {
  /** "$219.50 of $400.00", or "$12.00 spent" with no budget. */
  amount: string;
  /** "$180.50 left", "$1.50 over budget" or "No budget". */
  status: string;
  /** "includes $30.50 refunded", when anything was. */
  refunded: string | null;
}

/** The words under a category's name. */
export function budgetLineNote(line: BudgetLine, currency: string): BudgetLineNote {
  const money = (cents: number) => formatAccountBalance(cents, currency);
  const refunded = line.refunded_cents > 0 ? MSG.refunded(money(line.refunded_cents)) : null;
  if (line.budget_cents === null || line.remaining_cents === null) {
    return { amount: MSG.spentOnly(money(line.spent_cents)), status: MSG.noBudget, refunded };
  }
  const status = line.is_over_budget
    ? MSG.over(money(-line.remaining_cents))
    : MSG.remaining(money(line.remaining_cents));
  return { amount: MSG.spentOf(money(line.spent_cents), money(line.budget_cents)), status, refunded };
}
