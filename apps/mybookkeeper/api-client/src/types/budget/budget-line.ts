/** One personal spending category's budget against what was spent, for a month. */
export interface BudgetLine {
  spending_category_id: string;
  name: string;
  /** Archived categories are listed but can't be budgeted again. */
  is_archived: boolean;
  /** The budget in effect this month; null when there is none. */
  budget_cents: number | null;
  /** "YYYY-MM" the budget in effect started; null with no budget. */
  budget_effective_month: string | null;
  /** Expenses filed to the category, less refunds filed to it. Can be negative. */
  spent_cents: number;
  /** The refunds taken off ``spent_cents``. */
  refunded_cents: number;
  /** budget - spent; null with no budget. Negative when over. */
  remaining_cents: number | null;
  /** Whole percent of the budget spent; null with no budget or a zero one. */
  percent_used: number | null;
  is_over_budget: boolean;
}
