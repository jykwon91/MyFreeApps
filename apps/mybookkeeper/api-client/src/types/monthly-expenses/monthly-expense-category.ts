/** One line of the breakdown: what a kind of spending costs a month. */
export interface MonthlyExpenseCategory {
  label: string;
  /** Over every month in the range. */
  total_cents: number;
  /** ``total_cents`` spread over the months in the range. */
  average_cents: number;
  /** Of everything spent in the range, to one decimal place. */
  share_percent: number;
}
