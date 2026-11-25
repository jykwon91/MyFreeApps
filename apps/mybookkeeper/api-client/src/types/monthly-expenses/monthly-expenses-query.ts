import type { CashFlowScope } from "../cash-flow/cash-flow-scope";
import type { MonthlyExpenseRange } from "./monthly-expense-range";

/** What the monthly expenses page asks for. */
export interface MonthlyExpensesQuery {
  range: MonthlyExpenseRange;
  scope: CashFlowScope;
}
