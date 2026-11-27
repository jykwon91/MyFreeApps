import type { CashFlowScope } from "../cash-flow/cash-flow-scope";
import type { MonthlyExpenseCategory } from "./monthly-expense-category";
import type { MonthlyExpenseMonth } from "./monthly-expense-month";
import type { MonthlyExpenseRange } from "./monthly-expense-range";

/** ``GET /monthly-expenses``: the average full month of spending across every account. */
export interface MonthlyExpenses {
  range: MonthlyExpenseRange;
  scope: CashFlowScope;
  currency: string;
  /** "YYYY-MM-DD": the first day a bank feed covers. From it on only money through an account counts; null is no bank feed, so every entry counts. */
  bank_history_start: string | null;
  /** Every full month averaged, oldest first, empty months included. */
  months: MonthlyExpenseMonth[];
  total_cents: number;
  average_cents: number;
  /** Largest first. */
  categories: MonthlyExpenseCategory[];
}
