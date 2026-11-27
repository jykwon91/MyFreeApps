/** Money in and out in one calendar month. */
export interface CashFlowMonth {
  /** "YYYY-MM". */
  month: string;
  money_in_cents: number;
  money_out_cents: number;
  /** The part of money out that paid a mortgage or a loan. */
  mortgages_loans_cents: number;
  /** in - out. */
  net_cents: number;
}
