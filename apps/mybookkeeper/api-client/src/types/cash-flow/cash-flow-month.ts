/** Money in and out in one calendar month. */
export interface CashFlowMonth {
  /** "YYYY-MM". */
  month: string;
  money_in_cents: number;
  money_out_cents: number;
  /** in - out. */
  net_cents: number;
}
