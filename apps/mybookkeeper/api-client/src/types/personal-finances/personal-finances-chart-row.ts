/** One month on the personal finances chart, in dollars. */
export interface PersonalFinancesChartRow {
  /** "YYYY-MM". */
  month: string;
  /** "Nov 26". */
  label: string;
  income: number;
  /** Expenses other than mortgage and loan payments. */
  spending: number;
  mortgagesLoans: number;
  net: number;
}
