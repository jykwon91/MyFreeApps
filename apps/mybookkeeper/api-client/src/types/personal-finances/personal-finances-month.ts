/** Money in and out in one month, as the personal finances page counts it. */
export interface PersonalFinancesMonth {
  /** "YYYY-MM". */
  month: string;
  /** Pay, other money in, and rent less the rentals' costs (below zero in a month a rental cost more than it brought in). */
  income_cents: number;
  /** Spending other than the rentals' costs, mortgage and loan payments included. */
  expenses_cents: number;
  /** The part of expenses that paid a mortgage or a loan. */
  mortgages_loans_cents: number;
  net_cents: number;
}
