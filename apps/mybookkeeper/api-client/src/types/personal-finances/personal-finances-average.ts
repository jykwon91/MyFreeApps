/** A month on average over the range's full months. */
export interface PersonalFinancesAverage {
  /** The range's months, less this month while it's still going. */
  months: number;
  income_cents: number;
  expenses_cents: number;
  net_cents: number;
  /** The same with one-offs left out of money in. */
  typical_income_cents: number;
  typical_net_cents: number;
}
