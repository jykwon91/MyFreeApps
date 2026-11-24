/** A category's budget from a month onward, as saved. */
export interface SpendingBudget {
  spending_category_id: string;
  /** "YYYY-MM". */
  effective_month: string;
  /** null: no budget from this month on. */
  amount_cents: number | null;
}
