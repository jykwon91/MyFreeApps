/** Money in and out over the whole range. */
export interface CashFlowTotals {
  money_in_cents: number;
  money_out_cents: number;
  /** The part of money out that paid a mortgage or a loan. */
  mortgages_loans_cents: number;
  net_cents: number;
}
