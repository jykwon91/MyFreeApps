/** A credit card idea's offer terms; any of them may be unknown. */
export interface SavingsCardDetails {
  sign_up_bonus: string | null;
  minimum_spend_dollars: number | null;
  spend_window_months: number | null;
  annual_fee_dollars: number | null;
  first_year_value_dollars: number | null;
  credit_impact: string | null;
}
