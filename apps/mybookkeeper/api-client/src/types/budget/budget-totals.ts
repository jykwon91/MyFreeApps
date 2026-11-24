/** The month's budgets added up against all personal spending. */
export interface BudgetTotals {
  /** Every listed category's budget; null when no category has one. */
  budgeted_cents: number | null;
  /** All personal spending this month, uncategorized and unbudgeted included. */
  spent_cents: number;
  remaining_cents: number | null;
  percent_used: number | null;
  is_over_budget: boolean;
}
