import type { BudgetLine } from "./budget-line";
import type { BudgetTotals } from "./budget-totals";

/** ``GET /budgets?month=YYYY-MM``: one month's budget against actual spending. */
export interface BudgetMonth {
  /** "YYYY-MM". */
  month: string;
  currency: string;
  /** Live categories, then archived ones, alphabetical within each. */
  lines: BudgetLine[];
  /** Personal expenses with no spending category this month. */
  uncategorized_spent_cents: number;
  totals: BudgetTotals;
}
