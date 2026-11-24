/** ``PUT /budgets/{spending_category_id}``: the budget holds from this month until the category's next change. */
export interface SpendingBudgetUpdateRequest {
  /** "YYYY-MM". */
  effective_month: string;
  /** null removes the budget from this month on. */
  amount_cents: number | null;
}
