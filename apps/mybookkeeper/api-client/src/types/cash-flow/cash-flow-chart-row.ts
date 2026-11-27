/** One month on the cash flow chart, in dollars. */
export interface CashFlowChartRow {
  /** "YYYY-MM". */
  month: string;
  /** "Nov 26". */
  label: string;
  moneyIn: number;
  moneyOut: number;
  /** Money out other than mortgage and loan payments. */
  spending: number;
  mortgagesLoans: number;
  net: number;
}
