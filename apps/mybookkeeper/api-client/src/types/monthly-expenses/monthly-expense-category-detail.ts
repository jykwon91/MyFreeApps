import type { CashFlowScope } from "../cash-flow/cash-flow-scope";
import type { MonthlyExpensePayee } from "./monthly-expense-payee";
import type { MonthlyExpenseRange } from "./monthly-expense-range";
import type { MonthlyExpenseTransaction } from "./monthly-expense-transaction";

/** ``GET /monthly-expenses/category``: exactly the payments the page counts under one heading. */
export interface MonthlyExpenseCategoryDetail {
  range: MonthlyExpenseRange;
  scope: CashFlowScope;
  label: string;
  currency: string;
  total_cents: number;
  /** Who got the most first. */
  payees: MonthlyExpensePayee[];
  /** Newest first. */
  transactions: MonthlyExpenseTransaction[];
}
